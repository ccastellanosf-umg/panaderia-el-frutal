// tests/helpers/telemetria.js
// Pruebas de la telemetría de Application Insights, comunes a los 4
// microservicios. El SDK se sustituye por un doble de prueba: estas
// pruebas nunca cargan ni contactan el SDK real.
const CONEXION = "InstrumentationKey=00000000-0000-0000-0000-000000000000";

function crearSdkFalso() {
  const configuracion = {
    setAutoCollectRequests: jest.fn().mockReturnThis(),
    setAutoCollectExceptions: jest.fn().mockReturnThis(),
    setAutoCollectDependencies: jest.fn().mockReturnThis(),
    setAutoCollectConsole: jest.fn().mockReturnThis(),
    setAutoCollectPerformance: jest.fn().mockReturnThis(),
    setSendLiveMetrics: jest.fn().mockReturnThis(),
    start: jest.fn(),
  };
  return { setup: jest.fn().mockReturnValue(configuracion), configuracion };
}

// Registers the telemetry tests for one service, e.g. pruebasTelemetria("pagos").
function pruebasTelemetria(nombre) {
  const { iniciarTelemetria } = require(`../../src/${nombre}/lib/telemetria`);
  describe(`Telemetría (${nombre})`, () => {
    it("sin APPLICATIONINSIGHTS_CONNECTION_STRING no usa el SDK y devuelve false", () => {
      const sdk = crearSdkFalso();
      const env = {};

      expect(iniciarTelemetria(env, sdk)).toBe(false);
      expect(sdk.setup).not.toHaveBeenCalled();
      expect(sdk.configuracion.start).not.toHaveBeenCalled();
      expect(env.OTEL_SERVICE_NAME).toBeUndefined();
    });

    it("una cadena vacía o con espacios cuenta como no configurada", () => {
      const sdk = crearSdkFalso();

      expect(
        iniciarTelemetria({ APPLICATIONINSIGHTS_CONNECTION_STRING: "  " }, sdk),
      ).toBe(false);
      expect(sdk.setup).not.toHaveBeenCalled();
    });

    it("sin la variable no carga el SDK real (carga perezosa)", () => {
      const cargas = [];
      jest.isolateModules(() => {
        jest.doMock(
          "applicationinsights",
          () => {
            cargas.push(1);
            return {};
          },
          { virtual: true },
        );
        const { iniciarTelemetria: iniciar } = jest.requireActual(
          `../../src/${nombre}/lib/telemetria`,
        );
        expect(iniciar({})).toBe(false);
      });
      expect(cargas).toHaveLength(0);
    });

    it("con la variable configura el SDK, fija el rol del servicio y arranca una vez", () => {
      const sdk = crearSdkFalso();
      const env = { APPLICATIONINSIGHTS_CONNECTION_STRING: CONEXION };

      expect(iniciarTelemetria(env, sdk)).toBe(true);
      expect(sdk.setup).toHaveBeenCalledTimes(1);
      expect(sdk.setup).toHaveBeenCalledWith(CONEXION);
      expect(env.OTEL_SERVICE_NAME).toBe(nombre);
      expect(sdk.configuracion.setAutoCollectRequests).toHaveBeenCalledWith(true);
      expect(sdk.configuracion.setAutoCollectExceptions).toHaveBeenCalledWith(true);
      expect(sdk.configuracion.setAutoCollectDependencies).toHaveBeenCalledWith(true);
      expect(sdk.configuracion.setAutoCollectConsole).toHaveBeenCalledWith(false);
      expect(sdk.configuracion.start).toHaveBeenCalledTimes(1);
    });

    it("respeta un OTEL_SERVICE_NAME ya definido", () => {
      const sdk = crearSdkFalso();
      const env = {
        APPLICATIONINSIGHTS_CONNECTION_STRING: CONEXION,
        OTEL_SERVICE_NAME: "personalizado",
      };

      iniciarTelemetria(env, sdk);
      expect(env.OTEL_SERVICE_NAME).toBe("personalizado");
    });

    it("nunca escribe la cadena de conexión en los logs", () => {
      const sdk = crearSdkFalso();
      const espias = ["log", "info", "warn", "error"].map((m) =>
        jest.spyOn(console, m).mockImplementation(() => {}),
      );
      iniciarTelemetria({ APPLICATIONINSIGHTS_CONNECTION_STRING: CONEXION }, sdk);
      const escrito = JSON.stringify(espias.flatMap((e) => e.mock.calls));
      espias.forEach((e) => e.mockRestore());

      expect(escrito).not.toContain(CONEXION);
    });
  });
}

module.exports = { pruebasTelemetria, crearSdkFalso, CONEXION };
