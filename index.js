// Secure Perfume Store ChatGPT Backend API
// Production-ready with security improvements

const express = require('express');
const OpenAI = require('openai');

const app = express();

// Security Configuration
const ALLOWED_ORIGINS = [
    'https://zm0kik-wv.myshopify.com',
    'https://perfume-diy.com',  // Your future custom domain
    'http://localhost:3000'     // For local testing - remove in production
];

const MAX_MESSAGE_LENGTH = 500;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 30; // 30 requests per 15 minutes per IP

// Rate limiting implementation (simple in-memory store)
const rateLimitStore = new Map();

function rateLimit(req, res, next) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    
    // Clean old entries
    for (const [ip, data] of rateLimitStore.entries()) {
        if (data.resetTime < now) {
            rateLimitStore.delete(ip);
        }
    }
    
    // Get current client data
    let clientData = rateLimitStore.get(clientIP);
    if (!clientData) {
        clientData = {
            requests: 0,
            resetTime: now + RATE_LIMIT_WINDOW
        };
    }
    
    // Check if within rate limit
    if (clientData.requests >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
    }
    
    // Update request count
    clientData.requests++;
    rateLimitStore.set(clientIP, clientData);
    
    // Add rate limit headers
    res.set({
        'X-RateLimit-Limit': RATE_LIMIT_MAX,
        'X-RateLimit-Remaining': Math.max(0, RATE_LIMIT_MAX - clientData.requests),
        'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString()
    });
    
    next();
}

// Secure CORS Middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    console.log(`📞 ${req.method} ${req.url} from: ${origin || 'direct'}`);
    
    // Check if origin is allowed
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        console.log('✅ Origin allowed:', origin);
    } else if (!origin) {
        // Allow requests with no origin (like Postman, curl)
        res.header('Access-Control-Allow-Origin', '*');
        console.log('✅ No origin (direct request)');
    } else {
        console.log('❌ Origin blocked:', origin);
        return res.status(403).json({ error: 'Origin not allowed' });
    }
    
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.header('Access-Control-Max-Age', '3600');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS preflight handled');
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: '10mb' }));

// Apply rate limiting to chat endpoints
app.use('/api/chat', rateLimit);
app.use('/api/chat-with-history', rateLimit);
app.use('/api/recommendations', rateLimit);

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Input validation middleware
function validateChatInput(req, res, next) {
    const { message } = req.body;
    
    if (!message) {
        return res.status(400).json({ 
            error: 'Message is required' 
        });
    }
    
    if (typeof message !== 'string') {
        return res.status(400).json({ 
            error: 'Message must be a string' 
        });
    }
    
    if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ 
            error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters allowed.` 
        });
    }
    
    if (message.trim().length === 0) {
        return res.status(400).json({ 
            error: 'Message cannot be empty' 
        });
    }
    
    next();
}

// Perfume store system prompt
const PERFUME_SYSTEM_PROMPT = `
You are an expert perfume consultant for PERFUME.DIY, a boutique fragrance store. Your role is to:

1. Help customers find the perfect perfume based on their preferences
2. Provide detailed fragrance recommendations
3. Explain scent families and notes
4. Suggest occasions for different fragrances
5. Guide customers through the shopping process

STORE CONTEXT:
- Store name: PERFUME.DIY
- We specialize in premium and niche fragrances
- We have products like Tom Ford Black Orchid, and many others
- We're located in Israel (prices in NIS)

GUIDELINES:
- Be knowledgeable but friendly and approachable
- Ask clarifying questions about preferences (fresh vs warm, day vs night, etc.)
- Mention specific fragrance families: Fresh, Floral, Oriental, Woody
- Suggest 2-3 specific products when possible
- Keep responses concise but informative (2-3 sentences max unless asked for details)
- Always be helpful and encourage exploration
- Never provide harmful, inappropriate, or off-topic content

SCENT FAMILIES TO REFERENCE:
- Fresh: Citrus, aquatic, green notes
- Floral: Rose, jasmine, lily, peony
- Oriental: Vanilla, amber, spices, incense
- Woody: Sandalwood, cedar, vetiver, oud

Remember: You're here to help customers discover their signature scent!
`;

// Main chat endpoint
app.post('/api/chat', validateChatInput, async (req, res) => {
    try {
        const { message, context } = req.body;

        console.log('💬 Processing chat request:', message.substring(0, 50) + '...');

        // Create chat completion
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: PERFUME_SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: message
                }
            ],
            max_tokens: 300,
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;
        
        console.log('✅ ChatGPT response generated');

        res.json({
            response: response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ OpenAI API Error:', error.message);
        
        // Handle different types of errors
        if (error.code === 'insufficient_quota') {
            res.status(402).json({ 
                error: 'Service temporarily unavailable. Please try again later.' 
            });
        } else if (error.code === 'invalid_api_key') {
            res.status(500).json({ 
                error: 'Service configuration error. Please contact support.' 
            });
        } else if (error.code === 'rate_limit_exceeded') {
            res.status(429).json({ 
                error: 'Service busy. Please try again in a moment.' 
            });
        } else {
            res.status(500).json({ 
                error: 'Sorry, I\'m having trouble right now. Please try again later.' 
            });
        }
    }
});

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        security: 'enabled'
    });
});

// Enhanced chat endpoint with conversation history
app.post('/api/chat-with-history', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        if (messages.length > 20) {
            return res.status(400).json({ error: 'Too many messages in history. Maximum 20 allowed.' });
        }

        // Validate each message
        for (const msg of messages) {
            if (!msg.role || !msg.content) {
                return res.status(400).json({ error: 'Invalid message format' });
            }
            if (msg.content.length > MAX_MESSAGE_LENGTH) {
                return res.status(400).json({ error: 'Message too long in history' });
            }
        }

        // Prepare messages for OpenAI (include system prompt)
        const openAIMessages = [
            {
                role: "system",
                content: PERFUME_SYSTEM_PROMPT
            },
            ...messages
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: openAIMessages,
            max_tokens: 300,
            temperature: 0.7,
        });

        const response = completion.choices[0].message.content;

        res.json({
            response: response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ OpenAI API Error:', error.message);
        res.status(500).json({ 
            error: 'Sorry, I\'m having trouble right now. Please try again later.' 
        });
    }
});

// Get perfume recommendations based on preferences
app.post('/api/recommendations', async (req, res) => {
    try {
        const { preferences } = req.body;
        
        if (!preferences) {
            return res.status(400).json({ error: 'Preferences are required' });
        }

        const prompt = `Based on these preferences: ${JSON.stringify(preferences)}, recommend 3 specific perfumes from our collection. Include the name, brief description, and why it matches their preferences.`;

        if (prompt.length > MAX_MESSAGE_LENGTH * 2) {
            return res.status(400).json({ error: 'Preferences too detailed' });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: PERFUME_SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 400,
            temperature: 0.7,
        });

        const recommendations = completion.choices[0].message.content;

        res.json({
            recommendations: recommendations,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ OpenAI API Error:', error.message);
        res.status(500).json({ 
            error: 'Unable to generate recommendations right now.' 
        });
    }
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('❌ Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Perfume ChatBot API running on port ${PORT}`);
    console.log(`🔒 Security: Enhanced CORS + Rate Limiting enabled`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
