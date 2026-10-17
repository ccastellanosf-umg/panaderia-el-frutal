// src/auth/index.js
// Telemetry first: the SDK must start before the other modules load.
require("./lib/telemetria").iniciarTelemetria();

const app = require("./app");

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Microservicio de autenticación escuchando en el puerto ${PORT}`);
});
