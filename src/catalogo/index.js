// src/catalogo/index.js
const app = require("./app");

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Microservicio de catálogo escuchando en el puerto ${PORT}`);
});
