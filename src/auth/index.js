// src/auth/index.js
const app = require("./app");

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Microservicio de autenticación escuchando en el puerto ${PORT}`);
});
