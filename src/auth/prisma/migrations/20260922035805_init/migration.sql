-- CreateTable
CREATE TABLE "usuarios" (
    "idUsuario" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "contrasenaHash" VARCHAR(255) NOT NULL,
    "rol" VARCHAR(20) NOT NULL,
    "fechaRegistro" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("idUsuario")
);

-- CreateTable
CREATE TABLE "clientes" (
    "idCliente" SERIAL NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "telefono" VARCHAR(15),
    "direccion" VARCHAR(200),
    "tipoCliente" VARCHAR(20) NOT NULL DEFAULT 'ocasional',

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("idCliente")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_idUsuario_key" ON "clientes"("idUsuario");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "usuarios"("idUsuario") ON DELETE RESTRICT ON UPDATE CASCADE;
