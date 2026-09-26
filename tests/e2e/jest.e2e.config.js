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
    // Readable report for the deliverable: test-results/html/reporte-e2e.html
    [
      "jest-html-reporters",
      {
        publicPath: "test-results/html",
        filename: "reporte-e2e.html",
        pageTitle: "Panadería El Frutal — Suite E2E Fase 1",
        expand: true,
        inlineSource: true,
      },
    ],
  ],
};
