// src/pedidos/index.js
const app = require("./app");

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Microservicio de pedidos escuchando en el puerto ${PORT}`);
});
