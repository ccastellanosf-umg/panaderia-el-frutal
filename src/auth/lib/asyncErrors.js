// src/auth/lib/asyncErrors.js
// DEF-01/DEF-02/DEF-09 crash-proofing: ningún error async/rechazo de
// promesa dentro de un handler de ruta debe tumbar el proceso.
// Express 4 no reenvía automáticamente los rechazos de promesas de
// handlers async a next(err); si nadie los captura, se convierten en
// un "unhandledRejection" que Node.js (>=15) trata matando el
// proceso. Este módulo parchea `Layer.prototype.handle` (mismo
// mecanismo que usa el paquete `express-async-errors`) para que,
// cuando un handler async rechace su promesa, el error se reenvíe a
// next(err) en vez de escapar sin control.
//
// Debe requerirse ANTES de registrar cualquier ruta (es decir, antes
// de requerir los archivos de routes/*), porque solo afecta a los
// Layer creados después de aplicar el parche.
"use strict";

const Layer = require("express/lib/router/layer");

if (!Layer.prototype.__asyncErrorsPatched) {
  Object.defineProperty(Layer.prototype, "handle", {
    enumerable: true,
    configurable: true,
    get() {
      return this.__handle;
    },
    set(fn) {
      // Middleware de manejo de errores (4 argumentos): no envolver.
      if (typeof fn !== "function" || fn.length === 4) {
        this.__handle = fn;
        return;
      }
      this.__handle = function asyncWrapped(...args) {
        const next = args[args.length - 1];
        try {
          const resultado = fn.apply(this, args);
          if (resultado && typeof resultado.catch === "function") {
            resultado.catch(next);
          }
        } catch (err) {
          next(err);
        }
      };
    },
  });
  Layer.prototype.__asyncErrorsPatched = true;
}

module.exports = {};
