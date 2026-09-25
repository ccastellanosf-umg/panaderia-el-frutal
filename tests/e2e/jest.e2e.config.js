// tests/e2e/jest.e2e.config.js
// Configuración separada de la de las pruebas unitarias de cada
// microservicio: corre contra servicios REALES (docker compose o
// Azure), nunca con Prisma/Redis mockeados.
module.exports = {
  rootDir: "../../",
  testMatch: ["<rootDir>/tests/e2e/**/*.e2e.test.js"],
  testEnvironment: "node",
  testTimeout: 30000,
  reporters: [
    "default",
    [
      "jest-junit",
      { outputDirectory: "test-results", outputName: "e2e-junit.xml", addFileAttribute: "true" },
    ],
  ],
};
