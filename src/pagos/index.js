// src/pagos/index.js
// Telemetry first: the SDK must start before the other modules load.
require("./lib/telemetria").iniciarTelemetria();

const app = require("./app");

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Microservicio de pagos escuchando en el puerto ${PORT}`);
});
