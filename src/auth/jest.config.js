// src/auth/jest.config.js
// Los tests viven en ../../tests (root) pero las dependencias del
// servicio (Prisma Client, etc.) solo están instaladas en
// src/auth/node_modules. modulePaths permite que jest.mock(...) y los
// require(...) de los tests resuelvan esos paquetes.
module.exports = {
  modulePaths: ["<rootDir>/node_modules"],
  testEnvironment: "node",
  // Cobertura para SonarCloud: se excluye index.js (arranque del servidor,
  // no se ejecuta en las pruebas unitarias).
  collectCoverageFrom: ["app.js", "lib/**/*.js", "middlewares/**/*.js", "routes/**/*.js"],
  coverageReporters: ["lcov", "text-summary"],
};
