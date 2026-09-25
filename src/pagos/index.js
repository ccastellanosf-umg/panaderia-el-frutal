// src/pagos/index.js
const app = require("./app");

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Microservicio de pagos escuchando en el puerto ${PORT}`);
});
