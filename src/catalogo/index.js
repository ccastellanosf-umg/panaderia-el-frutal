// src/catalogo/index.js
// Telemetry first: the SDK must start before the other modules load.
require("./lib/telemetria").iniciarTelemetria();

const app = require("./app");

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Microservicio de catálogo escuchando en el puerto ${PORT}`);
});
