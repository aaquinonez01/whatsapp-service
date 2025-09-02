import { config } from 'dotenv'
import { createBot, createProvider, createFlow } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

config()

const PORT = process.env.PORT ?? 3003
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE_NUMBER

interface ConnectionStatus {
    isConnected: boolean;
    status: 'connected' | 'connecting' | 'disconnected' | 'error';
}

let connectionStatus: ConnectionStatus = {
    isConnected: false,
    status: 'disconnected'
}

const validateConfig = (): void => {
    if (!WHATSAPP_PHONE) {
        throw new Error('WHATSAPP_PHONE_NUMBER environment variable is required')
    }
    console.log(`🔧 Configuration:`)
    console.log(`   - Port: ${PORT}`)
    console.log(`   - WhatsApp Phone: ${WHATSAPP_PHONE}`)
}

const main = async () => {
    try {
        validateConfig()
        
        console.log('🤖 Inicializando WhatsApp API Service...')
        
        const adapterDB = new Database()
        const adapterFlow = createFlow([]) // Sin flows de chatbot
        
        const adapterProvider = createProvider(Provider, {
            usePairingCode: true,
            phoneNumber: WHATSAPP_PHONE,
            experimentalStore: true,
            timeRelease: 10800000
        })

        // Event listeners
        adapterProvider.on('auth_failure', (error) => {
            console.log('❌ Fallo de autenticación WhatsApp')
            console.log('⚡⚡ ERROR AUTH ⚡⚡')
            console.log('Detalles del error:', error)
            connectionStatus = { isConnected: false, status: 'error' }
            
            // Reintentar conexión después de 5 segundos
            setTimeout(() => {
                console.log('🔄 Reintentando conexión WhatsApp...')
                connectionStatus = { isConnected: false, status: 'connecting' }
            }, 5000)
        })

        adapterProvider.on('ready', () => {
            console.log('✅ WhatsApp conectado y listo')
            connectionStatus = { isConnected: true, status: 'connected' }
        })

        adapterProvider.on('qr', () => {
            console.log('🔗 Esperando autenticación por código de pairing...')
            connectionStatus = { isConnected: false, status: 'connecting' }
        })

        adapterProvider.on('pairing-code', (code: string) => {
            console.log(`📱 Código de pairing: ${code}`)
            console.log(`   Use este código en WhatsApp para conectar el número ${WHATSAPP_PHONE}`)
            console.log(`⚡⚡ ACTION REQUIRED ⚡⚡`)
            console.log(`Accept the WhatsApp notification from ${WHATSAPP_PHONE} on your phone 👌`)
            console.log(`The token for linking is: ${code}`)
        })

        // Manejo de errores del proveedor
        adapterProvider.on('error', (error) => {
            console.error('❌ Error del proveedor WhatsApp:', error)
            connectionStatus = { isConnected: false, status: 'error' }
        })

        // Manejo de desconexiones
        adapterProvider.on('close', () => {
            console.log('⚠️ Conexión WhatsApp cerrada')
            connectionStatus = { isConnected: false, status: 'disconnected' }
        })

        const { handleCtx, httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        })

        // API Root endpoint
        adapterProvider.server.get('/', (req: any, res: any) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ 
                message: '🟢 WhatsApp API activa',
                version: '1.0.0',
                endpoints: {
                    sendMessage: 'POST /send-message',
                    status: 'GET /status'
                }
            }))
        })

        // Send message endpoint (compatible with your existing code)
        adapterProvider.server.post(
            '/send-message',
            handleCtx(async (bot, req, res) => {
                try {
                    const { number, message } = req.body

                    if (!number || !message) {
                        res.writeHead(400, { 'Content-Type': 'application/json' })
                        return res.end(JSON.stringify({ 
                            error: 'Faltan campos: number y message son requeridos' 
                        }))
                    }

                    if (!connectionStatus.isConnected) {
                        res.writeHead(400, { 'Content-Type': 'application/json' })
                        return res.end(JSON.stringify({ 
                            error: 'WhatsApp no está conectado',
                            status: 'not_connected'
                        }))
                    }

                    await bot.sendMessage(number, message, {})
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ 
                        success: true, 
                        message: '✅ Mensaje enviado correctamente',
                        to: number
                    }))

                } catch (error: any) {
                    console.error('❌ Error al enviar mensaje:', error)
                    res.writeHead(500, { 'Content-Type': 'application/json' })
                    return res.end(JSON.stringify({ 
                        error: 'Error al enviar mensaje',
                        details: error.message 
                    }))
                }
            })
        )

        // Status endpoint
        adapterProvider.server.get('/status', (req: any, res: any) => {
            try {
                const response = {
                    isConnected: connectionStatus.isConnected,
                    status: connectionStatus.status,
                    message: connectionStatus.isConnected ? 
                        '✅ WhatsApp conectado y listo para enviar mensajes' : 
                        '⏳ WhatsApp no conectado'
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify(response))
                
            } catch (error: any) {
                console.error('❌ Error en /status:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    error: 'Error al obtener estado',
                    details: error.message 
                }))
            }
        })

        httpServer(+PORT)
        console.log(`🚀 WhatsApp API ejecutándose en puerto ${PORT}`)
        console.log(`📊 Estado del servicio: http://localhost:${PORT}/status`)

    } catch (error) {
        console.error('❌ Error al iniciar la aplicación:', error)
        process.exit(1)
    }
}

main()
