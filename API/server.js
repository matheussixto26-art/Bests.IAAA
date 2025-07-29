// api/server.js
// Esta é a Serverless Function que atua como nosso servidor de back-end.

export default async function handler(request, response) {
    // Apenas requisições do tipo POST são permitidas para este endpoint.
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).end('Method Not Allowed');
    }

    try {
        // Pega os dados enviados pelo front-end (index.html).
        const { targetUrl, method, headers, body } = request.body;

        // Validação básica para garantir que os dados necessários foram enviados.
        if (!targetUrl || !method) {
            return response.status(400).json({ error: 'targetUrl e method são obrigatórios no corpo da requisição.' });
        }

        const options = {
            method: method,
            headers: headers || {},
        };

        // Adiciona o corpo (payload) à requisição apenas se ele existir
        // e o método não for GET.
        if (body && method.toUpperCase() !== 'GET') {
            options.body = JSON.stringify(body);
        }

        // Realiza a chamada de fetch para a API de destino (SED).
        const apiResponse = await fetch(targetUrl, options);

        // Tenta extrair a resposta como JSON.
        let data;
        try {
            data = await apiResponse.json();
        } catch (e) {
            // Se a resposta não for um JSON válido (ex: erro 500 com texto),
            // retorna o texto puro.
            data = { error: 'A resposta da API de destino não era um JSON válido.', responseText: await apiResponse.text() };
            return response.status(apiResponse.status).json(data);
        }
        
        // Retorna a resposta da API da SED (status e dados) de volta para o front-end.
        response.status(apiResponse.status).json(data);

    } catch (error) {
        // Em caso de erro na nossa função, loga no console da Vercel e retorna um erro 500.
        console.error('Erro no servidor proxy (server.js):', error);
        response.status(500).json({ error: 'Ocorreu um erro interno no servidor.', details: error.message });
    }
}
