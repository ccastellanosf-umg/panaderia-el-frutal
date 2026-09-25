import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import RouteGuard from "./components/RouteGuard";

import Catalogo from "./pages/Catalogo";
import Login from "./pages/Login";
import Registro from "./pages/Registro";

import Carrito from "./pages/cliente/Carrito";
import Checkout from "./pages/cliente/Checkout";
import MisPedidos from "./pages/cliente/MisPedidos";
import PedidoDetalle from "./pages/cliente/PedidoDetalle";
import Suscripciones from "./pages/cliente/Suscripciones";

import Productos from "./pages/admin/Productos";
import SuscripcionesPagos from "./pages/admin/SuscripcionesPagos";
import Reportes from "./pages/admin/Reportes";

import PedidosVentas from "./pages/operador/PedidosVentas";

import Insumos from "./pages/produccion/Insumos";
import Recetas from "./pages/produccion/Recetas";
import ProduccionDiaria from "./pages/produccion/ProduccionDiaria";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />

          <Route
            path="/carrito"
            element={
              <RouteGuard roles={["cliente"]}>
                <Carrito />
              </RouteGuard>
            }
          />
          <Route
            path="/checkout"
            element={
              <RouteGuard roles={["cliente"]}>
                <Checkout />
              </RouteGuard>
            }
          />
          <Route
            path="/mis-pedidos"
            element={
              <RouteGuard roles={["cliente"]}>
                <MisPedidos />
              </RouteGuard>
            }
          />
          <Route
            path="/mis-pedidos/:id"
            element={
              <RouteGuard roles={["cliente"]}>
                <PedidoDetalle />
              </RouteGuard>
            }
          />
          <Route
            path="/suscripciones"
            element={
              <RouteGuard roles={["cliente"]}>
                <Suscripciones />
              </RouteGuard>
            }
          />

          <Route
            path="/admin/productos"
            element={
              <RouteGuard roles={["administrador"]}>
                <Productos />
              </RouteGuard>
            }
          />
          <Route
            path="/admin/suscripciones"
            element={
              <RouteGuard roles={["administrador"]}>
                <SuscripcionesPagos />
              </RouteGuard>
            }
          />
          <Route
            path="/admin/reportes"
            element={
              <RouteGuard roles={["administrador"]}>
                <Reportes />
              </RouteGuard>
            }
          />

          <Route
            path="/ventas/pedidos"
            element={
              <RouteGuard roles={["operador"]} areas={["ventas"]}>
                <PedidosVentas />
              </RouteGuard>
            }
          />

          <Route
            path="/produccion/insumos"
            element={
              <RouteGuard roles={["operador"]} areas={["produccion"]}>
                <Insumos />
              </RouteGuard>
            }
          />
          <Route
            path="/produccion/recetas"
            element={
              <RouteGuard roles={["operador"]} areas={["produccion"]}>
                <Recetas />
              </RouteGuard>
            }
          />
          <Route
            path="/produccion/diaria"
            element={
              <RouteGuard roles={["operador"]} areas={["produccion"]}>
                <ProduccionDiaria />
              </RouteGuard>
            }
          />

          <Route path="*" element={<Catalogo />} />
        </Routes>
      </main>
    </div>
  );
}
