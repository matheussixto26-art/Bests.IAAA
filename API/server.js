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

        // **INÍCIO DA CORREÇÃO**
        // Verifica o Content-Type da resposta antes de tentar o parse.
        const contentType = apiResponse.headers.get("content-type");
        let data;

        if (contentType && contentType.includes("application/json")) {
            // Se for JSON, faz o parse.
            data = await apiResponse.json();
        } else {
            // Se não for JSON (ex: HTML de erro), lê como texto.
            const responseText = await apiResponse.text();
            // Retorna um objeto de erro estruturado para o front-end.
            // Usamos o status original da resposta da API.
            return response.status(apiResponse.status).json({
                error: "A resposta da API de destino não foi JSON.",
                details: responseText.substring(0, 500) // Limita o tamanho para não sobrecarregar
            });
        }
        // **FIM DA CORREÇÃO**
        
        // Retorna a resposta da API da SED (status e dados) de volta para o front-end.
        response.status(apiResponse.status).json(data);

    } catch (error) {
        // Em caso de erro na nossa função, loga no console da Vercel e retorna um erro 500.
        console.error('Erro no servidor proxy (server.js):', error);
        response.status(500).json({ error: 'Ocorreu um erro interno no servidor.', details: error.message });
    }
}
