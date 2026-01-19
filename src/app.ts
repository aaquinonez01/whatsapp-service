import { config } from "dotenv";
import { createBot, createProvider, createFlow } from "@builderbot/bot";
import { MemoryDB as Database } from "@builderbot/bot";
import { BaileysProvider as Provider } from "@builderbot/provider-baileys";

config();

const PORT = process.env.PORT ?? 3003;
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE_NUMBER;

interface ConnectionStatus {
  isConnected: boolean;
  status: "connected" | "connecting" | "disconnected" | "error";
}

let connectionStatus: ConnectionStatus = {
  isConnected: false,
  status: "disconnected",
};

const validateConfig = (): void => {
  if (!WHATSAPP_PHONE) {
    throw new Error("WHATSAPP_PHONE_NUMBER environment variable is required");
  }
  console.log(`🔧 Configuration:`);
  console.log(`   - Port: ${PORT}`);
  console.log(`   - WhatsApp Phone: ${WHATSAPP_PHONE}`);
};

const main = async () => {
  try {
    validateConfig();

    console.log("🤖 Inicializando WhatsApp API Service...");

    const adapterDB = new Database();
    const adapterFlow = createFlow([]); // Sin flows de chatbot

    const adapterProvider = createProvider(Provider, {
      version: [2, 3000, 1032049861],
      browser: ["Windows", "Chrome", "Chrome 114.0.5735.198"],
      experimentalStore: true, // Significantly reduces resource consumption
      timeRelease: 10800000,    // Cleans up data every 3 hours (in milliseconds)
    });

    // Event listeners
    adapterProvider.on("auth_failure", (error) => {
      console.log("❌ Fallo de autenticación WhatsApp");
      console.log("⚡⚡ ERROR AUTH ⚡⚡");
      console.log("Detalles del error:", error);
      connectionStatus = { isConnected: false, status: "error" };

      // Reintentar conexión después de 5 segundos
      setTimeout(() => {
        console.log("🔄 Reintentando conexión WhatsApp...");
        connectionStatus = { isConnected: false, status: "connecting" };
      }, 5000);
    });

    adapterProvider.on("ready", () => {
      console.log("✅ WhatsApp conectado y listo");
      connectionStatus = { isConnected: true, status: "connected" };
    });

    adapterProvider.on("qr", (qr: string) => {
      console.log("🔗 QR Code generado - Escanea con WhatsApp:");
      console.log(`⚡⚡ ACTION REQUIRED ⚡⚡`);
      console.log("📱 Abre WhatsApp en tu teléfono");
      console.log("📱 Ve a Configuración > Dispositivos vinculados");
      console.log("📱 Toca 'Vincular un dispositivo'");
      console.log("📱 Escanea el siguiente código QR:");
      console.log("┌─────────────────────────────────────┐");
      console.log(`│ ${qr}`);
      console.log("└─────────────────────────────────────┘");
      console.log("💡 Si no puedes ver el QR, copia este enlace:");
      console.log(
        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
          qr
        )}`
      );
      connectionStatus = { isConnected: false, status: "connecting" };
    });

    // Manejo de errores del proveedor
    adapterProvider.on("error", (error) => {
      console.error("❌ Error del proveedor WhatsApp:", error);
      connectionStatus = { isConnected: false, status: "error" };
    });

    // Manejo de desconexiones
    adapterProvider.on("close", () => {
      console.log("⚠️ Conexión WhatsApp cerrada");
      connectionStatus = { isConnected: false, status: "disconnected" };
    });

    const { handleCtx, httpServer } = await createBot({
      flow: adapterFlow,
      provider: adapterProvider,
      database: adapterDB,
    });

    // API Root endpoint
    adapterProvider.server.get("/", (req: any, res: any) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          message: "🟢 WhatsApp API activa",
          version: "1.0.0",
          endpoints: {
            sendMessage: "POST /send-message",
            status: "GET /status",
          },
        })
      );
    });

    // Send message endpoint (compatible with your existing code)
    adapterProvider.server.post(
      "/send-message",
      handleCtx(async (bot, req, res) => {
        try {
          const { number, message } = req.body;

          if (!number || !message) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({
                error: "Faltan campos: number y message son requeridos",
              })
            );
          }

          if (!connectionStatus.isConnected) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({
                error: "WhatsApp no está conectado",
                status: "not_connected",
              })
            );
          }

          await bot.sendMessage(number, message, {});

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: true,
              message: "✅ Mensaje enviado correctamente",
              to: number,
            })
          );
        } catch (error: any) {
          console.error("❌ Error al enviar mensaje:", error);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              error: "Error al enviar mensaje",
              details: error.message,
            })
          );
        }
      })
    );

    // Status endpoint
    adapterProvider.server.get("/status", (req: any, res: any) => {
      try {
        const response = {
          isConnected: connectionStatus.isConnected,
          status: connectionStatus.status,
          message: connectionStatus.isConnected
            ? "✅ WhatsApp conectado y listo para enviar mensajes"
            : "⏳ WhatsApp no conectado",
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(response));
      } catch (error: any) {
        console.error("❌ Error en /status:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error: "Error al obtener estado",
            details: error.message,
          })
        );
      }
    });

    httpServer(+PORT);
    console.log(`🚀 WhatsApp API ejecutándose en puerto ${PORT}`);
    console.log(`📊 Estado del servicio: http://localhost:${PORT}/status`);
  } catch (error) {

    console.error("❌ Error al iniciar la aplicación:", error);
    process.exit(1);
  }
};

main();
