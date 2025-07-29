// api/server.js
// Orquestrador completo para o fluxo de login e busca de dados da Sala do Futuro.

// Função auxiliar para fazer chamadas fetch e tratar erros de forma robusta.
async function safeFetch(url, options) {
    const response = await fetch(url, options);

    // Tenta obter o corpo da resposta.
    let data;
    const responseText = await response.text(); // Lê como texto primeiro para evitar erros.
    try {
        data = JSON.parse(responseText); // Tenta fazer o parse.
    } catch (e) {
        // Se o parse falhar, o corpo não era JSON.
        data = { error: 'A resposta da API não era um JSON válido.', details: responseText.substring(0, 500) };
    }

    // Se a resposta não foi bem-sucedida (status não é 2xx), lança um erro.
    if (!response.ok) {
        const errorMessage = (data && data.error) ? `${data.error} - ${data.details || ''}` : `Erro na API de destino (Status: ${response.status})`;
        throw new Error(errorMessage);
    }
    
    return data;
}


export default async function handler(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).end('Method Not Allowed');
    }

    try {
        const { ra, senha } = request.body;
        if (!ra || !senha) {
            return response.status(400).json({ error: 'RA e senha são obrigatórios.' });
        }

        // Cabeçalhos base para simular um navegador legítimo.
        const baseHeaders = {
            'Origin': 'https://saladofuturo.educacao.sp.gov.br',
            'Referer': 'https://saladofuturo.educacao.sp.gov.br/',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
        };

        // --- ETAPA 1: Login na SED para obter o primeiro token ---
        const sedLoginUrl = 'https://sedintegracoes.educacao.sp.gov.br/credenciais/api/LoginCompletoToken';
        const sedLoginData = await safeFetch(sedLoginUrl, {
            method: 'POST',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
                'Ocp-Apim-Subscription-Key': '2b03c1db3884488795f79c37c069381a',
            },
            body: JSON.stringify({ user: ra, senha: senha }),
        });
        
        const sedToken = sedLoginData.token;
        if (!sedToken) throw new Error('Token da SED não encontrado na resposta do login inicial.');
        
        const codigoAluno = sedLoginData.perfils?.[0]?.codigo;
        if (!codigoAluno) throw new Error('Código do Aluno não encontrado na resposta do login inicial.');

        // --- ETAPA 2: Trocar o token da SED por um token da EDUSP ---
        const eduspTokenUrl = 'https://edusp-api.ip.tv/registration/edusp/token';
        const eduspTokenData = await safeFetch(eduspTokenUrl, {
            method: 'POST',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
                'x-api-realm': 'edusp',
                'x-api-platform': 'webclient',
            },
            body: JSON.stringify({ token: sedToken }),
        });

        const eduspApiKey = eduspTokenData.token;
        if (!eduspApiKey) throw new Error('Token (API Key) da EDUSP não encontrado na resposta da troca.');

        // --- ETAPA 3: Buscar dados de ambos os serviços em paralelo ---
        const [turmasData, roomsData] = await Promise.all([
            // Buscar Turmas da SED
            safeFetch(`https://sedintegracoes.educacao.sp.gov.br/apihubintegracoes/api/v2/Turma/ListarTurmasPorAluno?codigoAluno=${codigoAluno}`, {
                method: 'GET',
                headers: {
                    ...baseHeaders,
                    'Ocp-Apim-Subscription-Key': '5936fddda3484fe1aa4436df1bd76dab',
                    'Authorization': `Bearer ${sedToken}`, // Adicionando o token por segurança
                }
            }),
            // Buscar Salas/Cards da EDUSP
            safeFetch('https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true', {
                method: 'GET',
                headers: {
                    ...baseHeaders,
                    'x-api-key': eduspApiKey,
                    'x-api-realm': 'edusp',
                    'x-api-platform': 'webclient',
                }
            })
        ]);

        // --- ETAPA 4: Agregar e retornar a resposta final ---
        const finalResponse = {
            success: true,
            alunoInfo: {
                nome: sedLoginData.nome,
                email: sedLoginData.email,
                codigoAluno: codigoAluno,
            },
            turmas: turmasData,
            salasVirtuais: roomsData,
        };
        
        response.status(200).json(finalResponse);

    } catch (error) {
        console.error('Erro no fluxo de orquestração:', error);
        response.status(500).json({ success: false, error: 'Ocorreu um erro no servidor.', details: error.message });
    }
}
