// api/server.js
// Versão final de diagnóstico para o fluxo da Sala do Futuro.

async function safeFetch(url, options, stepName) {
    try {
        const response = await fetch(url, options);
        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`Status ${response.status}. Resposta: ${responseText.substring(0, 300)}`);
        }

        try {
            return JSON.parse(responseText);
        } catch (e) {
            throw new Error(`A resposta não era JSON. Resposta: ${responseText.substring(0, 300)}`);
        }
    } catch (error) {
        // Re-lança o erro com o nome da etapa para diagnóstico.
        throw new Error(`[Falha na Etapa: ${stepName}] - ${error.message}`);
    }
}

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).end('Method Not Allowed');
    }

    try {
        const { ra, senha } = request.body;
        if (!ra || !senha) {
            return response.status(400).json({ error: 'RA e senha são obrigatórios.' });
        }

        // Cabeçalhos que simulam um navegador Android via Chrome.
        const baseHeaders = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Origin': 'https://saladofuturo.educacao.sp.gov.br',
            'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
            'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
        };

        // --- ETAPA 1: Login na SED ---
        const sedLoginUrl = 'https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken';
        const sedLoginData = await safeFetch(sedLoginUrl, {
            method: 'POST',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': '2b03c1db3884488795f79c37c069381a',
            },
            body: JSON.stringify({ user: ra, senha: senha }),
        }, "Login SED");
        
        const sedToken = sedLoginData.token;
        if (!sedToken) throw new Error('[Análise da Etapa: Login SED] - Token da SED não encontrado na resposta.');
        
        const codigoAluno = sedLoginData.perfils?.[0]?.codigo;
        if (!codigoAluno) throw new Error('[Análise da Etapa: Login SED] - Código do Aluno não encontrado na resposta.');

        // --- ETAPA 2: Troca de Token para EDUSP ---
        const eduspTokenUrl = 'https://edusp-api.ip.tv/registration/edusp/token';
        const eduspTokenData = await safeFetch(eduspTokenUrl, {
            method: 'POST',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
                'x-api-realm': 'edusp',
                'x-api-platform': 'webclient',
                'Sec-Fetch-Site': 'cross-site', // Este é diferente para esta chamada
            },
            body: JSON.stringify({ token: sedToken }),
        }, "Troca de Token EDUSP");

        const eduspApiKey = eduspTokenData.token;
        if (!eduspApiKey) throw new Error('[Análise da Etapa: Troca de Token EDUSP] - API Key da EDUSP não encontrada.');

        // --- ETAPA 3: Busca de Dados (Turmas e Salas) ---
        const [turmasData, roomsData] = await Promise.all([
            safeFetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, {
                method: 'GET',
                headers: {
                    ...baseHeaders,
                    'Ocp-Apim-Subscription-Key': '5936fddda3484fe1aa4436df1bd76dab',
                    'Authorization': `Bearer ${sedToken}`,
                }
            }, "Buscar Turmas"),
            safeFetch('https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true', {
                method: 'GET',
                headers: {
                    ...baseHeaders,
                    'x-api-key': eduspApiKey,
                    'x-api-realm': 'edusp',
                    'x-api-platform': 'webclient',
                    'Sec-Fetch-Site': 'cross-site', // Diferente aqui também
                }
            }, "Buscar Salas Virtuais")
        ]);

        // --- SUCESSO ---
        response.status(200).json({
            success: true,
            alunoInfo: { nome: sedLoginData.nome, email: sedLoginData.email, codigoAluno },
            turmas: turmasData,
            salasVirtuais: roomsData,
        });

    } catch (error) {
        console.error('Erro no fluxo de diagnóstico:', error);
        response.status(500).json({ success: false, error: 'Ocorreu um erro no servidor.', details: error.message });
    }
}
