// src/auth/lib/telemetria.js
// Azure Application Insights telemetry. It is opt-in: without
// APPLICATIONINSIGHTS_CONNECTION_STRING (local dev, tests, CI) it does
// nothing and the SDK is not even loaded. Must be called at the very top
// of index.js, before express/pg/prisma are required, so the SDK can
// patch those modules.
const NOMBRE_SERVICIO = "auth";

function iniciarTelemetria(env = process.env, sdk) {
  const conexion = (env.APPLICATIONINSIGHTS_CONNECTION_STRING || "").trim();
  if (!conexion) return false;

  // Lazy require: the SDK is only loaded when telemetry is configured.
  const appInsights = sdk || require("applicationinsights");

  // The cloud role name is what the Application Map shows as a node.
  if (!env.OTEL_SERVICE_NAME) env.OTEL_SERVICE_NAME = NOMBRE_SERVICIO;

  // The connection string is never logged.
  appInsights
    .setup(conexion)
    .setAutoCollectRequests(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(false)
    .setAutoCollectPerformance(true, false)
    .setSendLiveMetrics(true)
    .start();
  return true;
}

module.exports = { iniciarTelemetria, NOMBRE_SERVICIO };
