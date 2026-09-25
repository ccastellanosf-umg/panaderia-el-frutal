// scripts/azure-devops/cargar-azure-devops.js
// Loads the Fase 1 test plan into Azure DevOps (E5) from the files in
// docs/azure-devops (run generar-csv.js first):
//   1. Test plan + 40 test cases with steps
//   2. 10 bugs with evidence attachment, "Tested By" link and final state
//   3. Test runs with the real outcome of every case (runs 1, 2 and 3)
//
// Usage:
//   AZURE_DEVOPS_TOKEN=$(az account get-access-token \
//     --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv) \
//   node scripts/azure-devops/cargar-azure-devops.js
const fs = require("fs");
const path = require("path");

const ORG = process.env.AZDO_ORG || "https://dev.azure.com/ccastellanosf";
const PROYECTO = process.env.AZDO_PROJECT || "Panaderia-El-Frutal";
const NOMBRE_PLAN = "Fase 1 — Panadería El Frutal";
const TOKEN = process.env.AZURE_DEVOPS_TOKEN;
if (!TOKEN) throw new Error("Missing AZURE_DEVOPS_TOKEN");

const raiz = path.resolve(__dirname, "../..");
const base = `${ORG}/${encodeURIComponent(PROYECTO)}/_apis`;

async function api(metodo, url, cuerpo, tipo = "application/json") {
  const res = await fetch(url.startsWith("http") ? url : `${base}/${url}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": tipo },
    body: cuerpo === undefined ? undefined : tipo === "application/octet-stream" ? cuerpo : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${url} -> ${res.status}: ${texto.slice(0, 400)}`);
  return texto ? JSON.parse(texto) : null;
}

// Minimal RFC 4180 parser (quoted fields, "" escapes, CRLF).
function leerCsv(rel) {
  const texto = fs.readFileSync(path.join(raiz, rel), "utf8").replace(/^﻿/, "");
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo.replace(/\r$/, "")); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  const [cabecera, ...datos] = filas;
  return datos.map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i] ?? ""])));
}

const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function pasosXml(pasos) {
  const cuerpo = pasos.map((p, i) =>
    `<step id="${i + 2}" type="${p.esperado ? "ValidateStep" : "ActionStep"}">` +
    `<parameterizedString isformatted="true">${escapar(escapar(p.accion))}</parameterizedString>` +
    `<parameterizedString isformatted="true">${escapar(escapar(p.esperado))}</parameterizedString>` +
    "<description/></step>").join("");
  return `<steps id="0" last="${pasos.length + 1}">${cuerpo}</steps>`;
}
const parche = (campos) => Object.entries(campos).map(([k, v]) => ({ op: "add", path: `/fields/${k}`, value: v }));

// Test cases grouped from the CSV (one "Test Case" row followed by its steps).
function casosDesdeCsv() {
  const casos = [];
  for (const f of leerCsv("docs/azure-devops/casos-prueba.csv")) {
    if (f["Work Item Type"] === "Test Case") {
      casos.push({ titulo: f.Title, prioridad: Number(f.Priority) || 2, tags: f.Tags, pasos: [] });
    }
    casos[casos.length - 1].pasos.push({ accion: f["Step Action"], esperado: f["Step Expected"] });
  }
  return casos.map((c) => ({ ...c, cp: c.titulo.match(/CP-\d{2}/)[0] }));
}

// Outcome per CP from a JUnit report.
function resultadosJunit(rel) {
  const xml = fs.readFileSync(path.join(raiz, rel), "utf8");
  const mapa = {};
  for (const m of xml.matchAll(/<testcase[^>]*name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const cp = (m[1].match(/CP-\d{2}/) || [])[0];
    if (cp) mapa[cp] = /<failure/.test(m[3] || "") ? "Failed" : "Passed";
  }
  return mapa;
}

async function main() {
  const existentes = await api("GET", "testplan/plans?api-version=7.1");
  if (existentes.value.some((p) => p.name === NOMBRE_PLAN)) {
    throw new Error(`Plan "${NOMBRE_PLAN}" already exists; aborting to avoid duplicates.`);
  }

  // 1. Plan and test cases.
  const plan = await api("POST", "testplan/plans?api-version=7.1", {
    name: NOMBRE_PLAN, areaPath: PROYECTO, iteration: PROYECTO,
    description: "Casos CP-01 a CP-40 del entregable E3; ejecución automatizada con la suite E2E (Jest).",
  });
  const suite = plan.rootSuite.id;
  console.log(`plan ${plan.id}, suite ${suite}`);

  const idPorCp = {};
  for (const c of casosDesdeCsv()) {
    const wi = await api("POST", "wit/workitems/$Test%20Case?api-version=7.1", parche({
      "System.Title": c.titulo,
      "Microsoft.VSTS.TCM.Steps": pasosXml(c.pasos),
      "Microsoft.VSTS.Common.Priority": c.prioridad,
      "System.Tags": c.tags,
    }), "application/json-patch+json");
    idPorCp[c.cp] = wi.id;
  }
  await api("POST", `testplan/Plans/${plan.id}/Suites/${suite}/TestCase?api-version=7.1`,
    Object.values(idPorCp).map((id) => ({ workItem: { id } })));
  console.log(`test cases: ${Object.keys(idPorCp).length}`);

  // 2. Bugs with evidence, link to their test case and final state.
  for (const b of leerCsv("docs/azure-devops/bugs.csv")) {
    const def = b.Title.match(/DEF-\d{2}/)[0];
    const cp = b.Tags.match(/CP-\d{2}/)[0];
    const cerrado = /Cerrado/.test(b.Tags);
    const archivo = path.join(raiz, `docs/defectos/evidencia/${def}.txt`);
    const adjunto = await api("POST", `${ORG}/_apis/wit/attachments?fileName=${def}.txt&api-version=7.1`,
      fs.readFileSync(archivo), "application/octet-stream");
    const bug = await api("POST", "wit/workitems/$Bug?api-version=7.1", [
      ...parche({
        "System.Title": b.Title,
        "Microsoft.VSTS.TCM.ReproSteps": b["Repro Steps"],
        "Microsoft.VSTS.Common.Severity": b.Severity,
        "Microsoft.VSTS.Common.Priority": Number(b.Priority),
        "System.Tags": b.Tags,
      }),
      { op: "add", path: "/relations/-", value: { rel: "AttachedFile", url: adjunto.url, attributes: { comment: "Evidencia" } } },
      { op: "add", path: "/relations/-", value: { rel: "Microsoft.VSTS.Common.TestedBy-Forward", url: `${ORG}/_apis/wit/workItems/${idPorCp[cp]}` } },
    ], "application/json-patch+json");
    const estados = cerrado ? ["Active", "Resolved", "Closed"] : ["Active"];
    for (const estado of estados) {
      await api("PATCH", `wit/workitems/${bug.id}?api-version=7.1`, parche({ "System.State": estado }),
        "application/json-patch+json");
    }
    console.log(`${def} -> bug ${bug.id} (${estados.at(-1)})`);
  }

  // 3. Test runs with the real outcomes.
  const puntos = await api("GET", `testplan/Plans/${plan.id}/Suites/${suite}/TestPoint?api-version=7.1`);
  const puntoPorCaso = Object.fromEntries(puntos.value.map((p) => [p.testCaseReference.id, p.id]));
  const ejecuciones = [
    ["Ejecución 1 — antes de las correcciones (local)", "docs/defectos/ejecucion-1-junit.xml"],
    ["Ejecución 2 — después de las correcciones (local)", "docs/defectos/ejecucion-2-junit.xml"],
    ["Ejecución 3 — despliegue en Azure", "docs/defectos/ejecucion-3-azure-junit.xml"],
  ];
  for (const [nombre, junit] of ejecuciones) {
    const resultado = resultadosJunit(junit);
    const run = await api("POST", "test/runs?api-version=7.1", {
      name: nombre, plan: { id: String(plan.id) },
      pointIds: Object.values(idPorCp).map((id) => puntoPorCaso[id]), automated: false,
    });
    const filas = await api("GET", `test/Runs/${run.id}/results?api-version=7.1&$top=100`);
    await api("PATCH", `test/Runs/${run.id}/results?api-version=7.1`, filas.value.map((r) => {
      const cp = Object.keys(idPorCp).find((k) => String(idPorCp[k]) === r.testCase.id);
      return { id: r.id, outcome: resultado[cp], state: "Completed" };
    }));
    await api("POST", `test/Runs/${run.id}/attachments?api-version=7.1`, {
      stream: fs.readFileSync(path.join(raiz, junit)).toString("base64"),
      fileName: path.basename(junit), attachmentType: "GeneralAttachment", comment: "Reporte JUnit de la suite E2E",
    });
    await api("PATCH", `test/runs/${run.id}?api-version=7.1`, { state: "Completed" });
    const fallidos = Object.values(resultado).filter((o) => o === "Failed").length;
    console.log(`${nombre}: run ${run.id}, ${Object.keys(resultado).length - fallidos} passed, ${fallidos} failed`);
  }
  console.log(`${ORG}/${encodeURIComponent(PROYECTO)}/_testPlans/define?planId=${plan.id}`);
}

// Incremental mode: adds the test cases missing from an existing plan
// and records one more run from a JUnit report.
//   PLAN_ID=63 EJECUCION="Ejecución 4 — ..." JUNIT=docs/defectos/... node cargar-azure-devops.js
async function agregarEjecucion(planId, nombre, junit) {
  const plan = await api("GET", `testplan/plans/${planId}?api-version=7.1`);
  const suite = plan.rootSuite.id;
  const enSuite = await api("GET", `testplan/Plans/${planId}/Suites/${suite}/TestCase?api-version=7.1`);
  const idPorCp = {};
  for (const tc of enSuite.value) {
    const cp = (tc.workItem.name.match(/CP-\d{2}/) || [])[0];
    if (cp) idPorCp[cp] = tc.workItem.id;
  }
  const nuevos = [];
  for (const c of casosDesdeCsv().filter((c) => !idPorCp[c.cp])) {
    const wi = await api("POST", "wit/workitems/$Test%20Case?api-version=7.1", parche({
      "System.Title": c.titulo,
      "Microsoft.VSTS.TCM.Steps": pasosXml(c.pasos),
      "Microsoft.VSTS.Common.Priority": c.prioridad,
      "System.Tags": c.tags,
    }), "application/json-patch+json");
    idPorCp[c.cp] = wi.id;
    nuevos.push({ workItem: { id: wi.id } });
    console.log(`${c.cp} -> test case ${wi.id}`);
  }
  if (nuevos.length) {
    await api("POST", `testplan/Plans/${planId}/Suites/${suite}/TestCase?api-version=7.1`, nuevos);
  }

  const resultado = resultadosJunit(junit);
  const puntos = await api("GET", `testplan/Plans/${planId}/Suites/${suite}/TestPoint?api-version=7.1`);
  const run = await api("POST", "test/runs?api-version=7.1", {
    name: nombre, plan: { id: String(planId) }, pointIds: puntos.value.map((p) => p.id), automated: false,
  });
  const filas = await api("GET", `test/Runs/${run.id}/results?api-version=7.1&$top=200`);
  await api("PATCH", `test/Runs/${run.id}/results?api-version=7.1`, filas.value.map((r) => {
    const cp = Object.keys(idPorCp).find((k) => String(idPorCp[k]) === r.testCase.id);
    return { id: r.id, outcome: resultado[cp], state: "Completed" };
  }));
  await api("POST", `test/Runs/${run.id}/attachments?api-version=7.1`, {
    stream: fs.readFileSync(path.join(raiz, junit)).toString("base64"),
    fileName: path.basename(junit), attachmentType: "GeneralAttachment", comment: "Reporte JUnit de la suite E2E",
  });
  await api("PATCH", `test/runs/${run.id}?api-version=7.1`, { state: "Completed" });
  const fallidos = Object.values(resultado).filter((o) => o === "Failed").length;
  console.log(`${nombre}: run ${run.id}, ${Object.keys(resultado).length - fallidos} passed, ${fallidos} failed`);
}

const tarea = process.env.PLAN_ID
  ? agregarEjecucion(process.env.PLAN_ID, process.env.EJECUCION, process.env.JUNIT)
  : main();
tarea.catch((e) => { console.error(e.message); process.exit(1); });
