// src/pedidos/index.js
// Telemetry first: the SDK must start before the other modules load.
require("./lib/telemetria").iniciarTelemetria();

const app = require("./app");

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Microservicio de pedidos escuchando en el puerto ${PORT}`);
});
