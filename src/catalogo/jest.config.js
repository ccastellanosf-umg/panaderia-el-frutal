// src/catalogo/jest.config.js
module.exports = {
  modulePaths: ["<rootDir>/node_modules"],
  testEnvironment: "node",
  // Cobertura para SonarCloud: se excluye index.js (arranque del servidor,
  // no se ejecuta en las pruebas unitarias).
  collectCoverageFrom: ["app.js", "lib/**/*.js", "middlewares/**/*.js", "routes/**/*.js"],
  coverageReporters: ["lcov", "text-summary"],
};
