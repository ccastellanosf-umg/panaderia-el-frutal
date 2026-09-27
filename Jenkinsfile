// ============================================================
// Jenkinsfile
// Transformación Digital de Panadería El Frutal — Grupo 3
// ============================================================
// This pipeline COMPLEMENTS azure-pipelines.yml; it does not
// replace it. Azure DevOps keeps deploying production to Azure
// (App Service + Static Web Apps) exactly as it does today —
// nothing in azure-pipelines.yml, docker-compose.yml, or the
// service source code changes here.
//
// Jenkins runs on a separate CI/CD path that:
//   - Builds and unit-tests the same four microservices + frontend
//     using the same commands as azure-pipelines.yml (mirrored,
//     not reimplemented differently), so both pipelines agree.
//   - Runs the full E2E suite (tests/e2e) against a disposable
//     docker-compose stack, entirely inside this Docker host —
//     something the Azure pipeline does not do.
//   - Deploys a persistent LOCAL staging environment (docker
//     compose, ports 4001-4004) on `main`, separate from Azure
//     production, using scripts/ci/deploy-staging.sh.
//
// Jenkins itself runs in a container on this Mac, sharing the
// HOST Docker daemon via a mounted socket (Docker Desktop). See
// docker-compose.ci.yml / docker-compose.staging.yml and
// scripts/ci/*.sh for how the pipeline works around that
// (no host-relative bind mounts, no published ports in CI,
// service DNS names instead of localhost).
// ============================================================

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        JWT_SECRET  = credentials('elfrutal-jwt-secret-test')
        DB_PASSWORD = credentials('elfrutal-db-password-test')
        STAGING_HOST = 'host.docker.internal'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --oneline'
                script {
                    // Sanitized to a valid Compose project name:
                    // lowercase, only [a-z0-9_-].
                    env.COMPOSE_PROJECT_NAME = "elfrutal-ci-${env.BUILD_TAG}"
                        .toLowerCase()
                        .replaceAll('[^a-z0-9_-]', '-')
                }
            }
        }

        stage('Build') {
            parallel {
                stage('Build auth') {
                    steps {
                        dir('src/auth') {
                            sh 'npm ci'
                            sh 'npx prisma generate'
                        }
                    }
                }
                stage('Build catalogo') {
                    steps {
                        dir('src/catalogo') {
                            sh 'npm ci'
                            sh 'npx prisma generate'
                        }
                    }
                }
                stage('Build pedidos') {
                    steps {
                        dir('src/pedidos') {
                            sh 'npm ci'
                        }
                    }
                }
                stage('Build pagos') {
                    steps {
                        dir('src/pagos') {
                            sh 'npm ci'
                        }
                    }
                }
                stage('Build frontend') {
                    steps {
                        dir('src/frontend') {
                            sh 'npm ci'
                            sh 'npm run build'
                        }
                    }
                }
                // Shared test tooling (jest, jest-junit, supertest) lives in the
                // root package.json. Installed once here: running `npm ci` on the
                // same folder from the parallel unit-test stages would race.
                stage('Install test tooling') {
                    steps {
                        sh 'npm ci'
                    }
                }
            }
        }

        stage('Test') {
            stages {
                stage('Unit tests') {
                    parallel {
                        stage('Unit tests auth') {
                            steps {
                                dir('src/auth') {
                                    sh 'npx prisma generate'
                                    sh '''
                                        JEST_JUNIT_OUTPUT_DIR=../../test-results \
                                        JEST_JUNIT_OUTPUT_NAME=unit-auth.xml \
                                        JWT_SECRET=clave-de-pruebas-no-productiva \
                                        npx jest auth.test.js --roots ../../tests --ci --forceExit \
                                          --reporters=default --reporters=jest-junit
                                    '''
                                }
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true, testResults: 'test-results/unit-auth.xml'
                                }
                            }
                        }
                        stage('Unit tests catalogo') {
                            steps {
                                dir('src/catalogo') {
                                    sh 'npx prisma generate'
                                    sh '''
                                        JEST_JUNIT_OUTPUT_DIR=../../test-results \
                                        JEST_JUNIT_OUTPUT_NAME=unit-catalogo.xml \
                                        JWT_SECRET=clave-de-pruebas-no-productiva \
                                        npx jest catalogo.test.js --roots ../../tests --ci --forceExit \
                                          --reporters=default --reporters=jest-junit
                                    '''
                                }
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true, testResults: 'test-results/unit-catalogo.xml'
                                }
                            }
                        }
                        stage('Unit tests pedidos') {
                            steps {
                                dir('src/pedidos') {
                                    sh '''
                                        JEST_JUNIT_OUTPUT_DIR=../../test-results \
                                        JEST_JUNIT_OUTPUT_NAME=unit-pedidos.xml \
                                        JWT_SECRET=clave-de-pruebas-no-productiva \
                                        npx jest pedidos.test.js --roots ../../tests --ci --forceExit \
                                          --reporters=default --reporters=jest-junit
                                    '''
                                }
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true, testResults: 'test-results/unit-pedidos.xml'
                                }
                            }
                        }
                        stage('Unit tests pagos') {
                            steps {
                                dir('src/pagos') {
                                    sh '''
                                        JEST_JUNIT_OUTPUT_DIR=../../test-results \
                                        JEST_JUNIT_OUTPUT_NAME=unit-pagos.xml \
                                        JWT_SECRET=clave-de-pruebas-no-productiva \
                                        npx jest pagos.test.js --roots ../../tests --ci --forceExit \
                                          --reporters=default --reporters=jest-junit
                                    '''
                                }
                            }
                            post {
                                always {
                                    junit allowEmptyResults: true, testResults: 'test-results/unit-pagos.xml'
                                }
                            }
                        }
                        stage('Unit tests frontend') {
                            steps {
                                dir('src/frontend') {
                                    sh 'npm test'
                                }
                            }
                        }
                    }
                }

                stage('E2E tests') {
                    steps {
                        // The E2E suite has 4 intentionally failing cases
                        // (open defects DEF-03/05/07/10 -> CP-33/35/37/40;
                        // 42 passed / 4 failed of 46 is the EXPECTED result).
                        // Failing test cases (exit 1) mark the build UNSTABLE so
                        // known defects stay visible without blocking the
                        // pipeline; an infrastructure problem (exit 2) still
                        // FAILS the build instead of hiding behind UNSTABLE.
                        script {
                            def rc = sh(script: 'bash scripts/ci/e2e.sh', returnStatus: true)
                            if (rc == 1) {
                                unstable('E2E: some test cases failed (expected while DEF-03/05/07/10 are open)')
                            } else if (rc != 0) {
                                error("E2E: infrastructure failure (scripts/ci/e2e.sh exited with ${rc})")
                            }
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'test-results/e2e-junit.xml'
                            archiveArtifacts artifacts: 'test-results/**', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('Deploy Staging') {
            when {
                branch 'main'
            }
            steps {
                sh 'bash scripts/ci/deploy-staging.sh'
            }
        }
    }

    post {
        success {
            echo 'Build succeeded: unit tests and E2E suite passed with no unexpected failures.'
        }
        unstable {
            echo 'Build UNSTABLE: this is expected while DEF-03/05/07/10 remain open (see tests/e2e/casos-prueba.e2e.test.js). Check test-results/ for details.'
        }
        failure {
            echo 'Build FAILED: an unexpected error occurred (build, unit tests, or infrastructure). Check the stage logs.'
        }
        always {
            cleanWs()
        }
    }
}
