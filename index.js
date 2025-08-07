// Perfume Store ChatGPT Backend API
// This can be deployed on Vercel, Netlify, or any Node.js hosting

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();

// Middleware
//app.use(cors());
// app.use(cors({
//     origin: ['https://zm0kik-wv.myshopify.com', 'https://your-custom-domain.com'],
//     credentials: true,
//     methods: ['GET', 'POST', 'OPTIONS'],
//     allowedHeaders: ['Content-Type', 'Authorization']
// }));
// app.use(express.json());
// // Handle preflight requests
// app.options('/api/chat', cors());

// app.use(cors({
//     origin: '*',
//     methods: ['GET', 'POST', 'OPTIONS'],
//     allowedHeaders: ['Content-Type']
// }));
// app.use(express.json());

// // Handle preflight requests
// app.options('/api/chat', cors());

// Middleware - Simple CORS for testing
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Content-Type');
    
//     if (req.method === 'OPTIONS') {
//         res.sendStatus(200);
//         return;
//     }
//     next();
// });

// app.use(express.json());
app.use((req, res, next) => {
    console.log(`📞 ${req.method} ${req.url} from: ${req.headers.origin}`);
    
    // Always set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'false');
    
    // Handle preflight immediately
    if (req.method === 'OPTIONS') {
        console.log('✅ OPTIONS handled');
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json());

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // Set this in your environment variables
});

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

SCENT FAMILIES TO REFERENCE:
- Fresh: Citrus, aquatic, green notes
- Floral: Rose, jasmine, lily, peony
- Oriental: Vanilla, amber, spices, incense
- Woody: Sandalwood, cedar, vetiver, oud

Remember: You're here to help customers discover their signature scent!
`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Create chat completion
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // or "gpt-3.5-turbo" for cost savings
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

        res.json({
            response: response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('OpenAI API Error:', error);
        
        // Handle different types of errors
        if (error.code === 'insufficient_quota') {
            res.status(402).json({ 
                error: 'API quota exceeded. Please check your OpenAI billing.' 
            });
        } else if (error.code === 'invalid_api_key') {
            res.status(401).json({ 
                error: 'Invalid API key. Please check your OpenAI configuration.' 
            });
        } else {
            res.status(500).json({ 
                error: 'Sorry, I\'m having trouble right now. Please try again later.' 
            });
        }
    }
});


//test api 
// Temporary mock response for testing
// app.post('/api/chat', async (req, res) => {
//     const { message } = req.body;
    
//     // Mock perfume consultant response
//     const mockResponse = `For ${message}, I'd recommend our signature collection. Tom Ford Black Orchid would be perfect - it's a luxurious, mysterious fragrance with notes of black truffle, bergamot, and black orchid. It's ideal for evening occasions and makes a bold statement. Would you like to know more about this fragrance or explore other options?`;
    
//     res.json({
//         response: mockResponse,
//         timestamp: new Date().toISOString()
//     });
// });


// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Enhanced chat endpoint with conversation history
app.post('/api/chat-with-history', async (req, res) => {
    try {
        const { messages } = req.body; // Array of message objects

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
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
        console.error('OpenAI API Error:', error);
        res.status(500).json({ 
            error: 'Sorry, I\'m having trouble right now. Please try again later.' 
        });
    }
});

// Get perfume recommendations based on preferences
app.post('/api/recommendations', async (req, res) => {
    try {
        const { preferences } = req.body;
        
        const prompt = `Based on these preferences: ${JSON.stringify(preferences)}, recommend 3 specific perfumes from our collection. Include the name, brief description, and why it matches their preferences.`;

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
        console.error('OpenAI API Error:', error);
        res.status(500).json({ 
            error: 'Unable to generate recommendations right now.' 
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Perfume ChatBot API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
