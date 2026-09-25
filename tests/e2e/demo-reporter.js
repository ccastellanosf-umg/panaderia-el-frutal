// tests/e2e/demo-reporter.js
// Reporter for `npm run demo:video`: prints only the cases that ran
// (skipped ones are hidden) plus the failure detail, so the live demo
// shows exactly the selected test cases.
class DemoReporter {
  onTestResult(_test, resultado) {
    for (const caso of resultado.testResults) {
      if (caso.status === "pending") continue;
      const icono = caso.status === "passed" ? "\x1b[32m✓ APROBADO\x1b[0m" : "\x1b[31m✕ FALLIDO\x1b[0m";
      console.log(`\n${icono}  ${caso.title}  (${caso.duration} ms)`);
      for (const fallo of caso.failureMessages) {
        console.log(fallo.split("\n").filter((l) => !l.includes("node_modules")).slice(0, 12).join("\n"));
      }
    }
  }

  onRunComplete(_contextos, resumen) {
    const { numPassedTests: ok, numFailedTests: ko } = resumen;
    console.log(`\nCasos ejecutados: ${ok + ko} — aprobados: ${ok} — fallidos: ${ko}\n`);
  }
}

module.exports = DemoReporter;
