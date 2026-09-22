-- CreateTable
CREATE TABLE "productos" (
    "idProducto" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(8,2) NOT NULL,
    "disponibilidad" BOOLEAN NOT NULL DEFAULT true,
    "fotoUrl" VARCHAR(255),

    CONSTRAINT "productos_pkey" PRIMARY KEY ("idProducto")
);
