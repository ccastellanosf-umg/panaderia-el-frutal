# Jenkins CI/CD (complementary to azure-pipelines.yml)

This Jenkins pipeline complements — it does not replace — `azure-pipelines.yml`.
Azure DevOps keeps deploying production to Azure App Service and Static Web
Apps exactly as before. Jenkins builds and unit-tests the same code, runs the
full E2E suite against a disposable docker-compose stack, and deploys a
persistent local staging environment on `main`.

## Prerequisites

- Jenkins running in a container, using an image extended from
  `jenkins/jenkins:2.568.3-lts-jdk21` with:
  - Node.js 20 (matches the microservices' `node:20-alpine`)
  - the `docker` CLI and the Docker Compose v2 plugin
  - the Jenkins container's Docker socket mounted to the **host** Docker
    daemon (Docker Desktop on the Mac agent), e.g.
    `-v /var/run/docker.sock:/var/run/docker.sock`
- Docker Desktop running on the same Mac, reachable from the Jenkins
  container as `host.docker.internal`.

## Jenkins credentials to create

| Credential ID              | Type                       | Purpose                                              |
|-----------------------------|----------------------------|-------------------------------------------------------|
| `elfrutal-jwt-secret-test`  | Secret text                | `JWT_SECRET` for the CI/staging stacks (test value)   |
| `elfrutal-db-password-test` | Secret text                | `DB_PASSWORD` for the CI/staging stacks (test value)  |
| a GitHub PAT                | Username with password    | Checkout access to the private repository             |

Use throwaway values for the two secret-text credentials — never production
secrets.

## Creating the Multibranch Pipeline job

1. New Item -> Multibranch Pipeline.
2. Branch Sources -> Git -> repository URL, credentials = the GitHub PAT
   credential above.
3. Build Configuration -> by Jenkinsfile, script path `Jenkinsfile` (repo
   root).
4. Save and let Jenkins scan the branches; it will pick up
   `feature/jenkins-ci` (and later `main`).

## What each stage does

- **Checkout**: checks out the branch and computes a sanitized
  `COMPOSE_PROJECT_NAME` (`elfrutal-ci-<build tag>`, lowercased, `[a-z0-9_-]`
  only) so each build gets its own isolated compose project — no collision
  with a developer's local stack or the staging stack.
- **Build**: in parallel, `npm ci` (+ `npx prisma generate` for `auth` and
  `catalogo`) for each microservice, and `npm ci` + `npm run build` for the
  frontend. A sibling `Install test tooling` stage runs the root `npm ci` once
  (jest, jest-junit, supertest), instead of once per unit-test stage, so the
  parallel stages never race on the same `node_modules`.
- **Test -> Unit tests**: in parallel, mirrors the commands
  `azure-pipelines.yml` uses per service (prisma generate where applicable,
  then
  `npx jest <svc>.test.js --roots ../../tests --ci --forceExit` with
  `JWT_SECRET=clave-de-pruebas-no-productiva`), plus `npm test` (Vitest) for
  the frontend. Each backend service also emits a JUnit report via
  `jest-junit` (already a devDependency), published with `junit`.
- **Test -> E2E tests**: runs `scripts/ci/e2e.sh`, which brings up the full
  docker-compose stack (CI override, no published ports) and runs
  `tests/e2e/casos-prueba.e2e.test.js` from inside the compose network. The
  JUnit and HTML reports are archived either way.
- **Deploy Staging**: only on `main` (Multibranch branch condition). Runs
  `scripts/ci/deploy-staging.sh`, which builds/updates the persistent
  `elfrutal-staging` compose project and smoke-tests `/health` on ports
  4001-4004.

## Why E2E marks the build UNSTABLE, not FAILED

The E2E suite has 4 intentionally failing cases — open defects DEF-03,
DEF-05, DEF-07, DEF-10 (test cases CP-33, CP-35, CP-37, CP-40; see
`docs/defectos/defectos.md`). The expected result is ~42 passed / 4 failed
of 46. `scripts/ci/e2e.sh` exits with `1` when test cases fail and with `2`
when the infrastructure fails (the stack never became healthy, the runner
crashed, or no JUnit report was produced). The `E2E tests` stage maps `1` to
UNSTABLE, so the *known* defects stay visible without blocking the pipeline,
and `2` to FAILED, so a broken environment is never hidden behind UNSTABLE.

## Running the scripts locally

```bash
export JWT_SECRET=some-test-secret
export DB_PASSWORD=some-test-password

# Run the E2E suite in an isolated, disposable stack (no ports published,
# safe to run alongside your own docker-compose.yml stack):
bash scripts/ci/e2e.sh
# Optional: override the compose project name (default: elfrutal-ci-local)
COMPOSE_PROJECT_NAME=my-test-run bash scripts/ci/e2e.sh

# Deploy/update the persistent local staging stack (ports 4001-4004):
bash scripts/ci/deploy-staging.sh
# Tear it down when you're done:
docker compose -p elfrutal-staging -f docker-compose.yml -f docker-compose.staging.yml down -v
```
