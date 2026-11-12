// Política de privacidade (pública, sem login). Descreve o que o app realmente faz com os dados.
import { Link } from 'react-router-dom'
import { TopBar } from '../components/ui.jsx'
import { PRIVACY_CONTACT, PRIVACY_CONTROLLER, PRIVACY_UPDATED } from '../config.js'

export default function Privacy() {
  return (
    <>
      <TopBar title="Privacidade" back="/ajustes" />
      <article className="page legal" data-testid="privacy">
        <h1>Política de privacidade do PaceOn</h1>
        <p className="muted small">Atualizada em {PRIVACY_UPDATED}.</p>

        <p>O PaceOn é um app para organizar provas de corrida: calendário, inscrições, custos, resultados, objetivos e a logística do dia da prova. Esta política explica, em linguagem simples, quais dados o app usa, onde eles ficam, com quem são compartilhados e como você controla tudo isso, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).</p>

        <h2>1. Quem é o responsável</h2>
        <p>O controlador dos dados é {PRIVACY_CONTROLLER}.{PRIVACY_CONTACT ? <> Contato para assuntos de privacidade: <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.</> : ' O contato para assuntos de privacidade está nos canais de suporte do app.'}</p>

        <h2>2. Sem conta, tudo fica no seu aparelho</h2>
        <p>Você pode usar o PaceOn sem criar conta. Nesse caso, provas, resultados, objetivos, custos, logística, perfil, anexos e fotos ficam <b>somente no armazenamento do seu navegador</b> (localStorage e IndexedDB). Nós não recebemos esses dados. Limpar os dados do site apaga tudo; por isso existe o backup em arquivo (Ajustes → Backup).</p>

        <h2>3. Que dados são tratados com conta</h2>
        <p>Ao criar conta (só e-mail e senha são obrigatórios, ou login com Google), seus dados são sincronizados com a nuvem para aparecerem nos seus outros aparelhos:</p>
        <ul>
          <li><b>Conta:</b> e-mail e senha (guardada pelo provedor de autenticação de forma protegida; nós não vemos a senha).</li>
          <li><b>Provas e objetivos:</b> nomes, datas, locais, distâncias, status, metas, custos (estimados e pagos), checklist, resultados (tempos, classificação, esforço, relato) e o resumo do arquivo do relógio (distância, tempo, frequência cardíaca média e máxima, subida e parciais por km). O trajeto GPS do relógio <b>não</b> é guardado.</li>
          <li><b>Anexos e fotos</b> que você adicionar (comprovantes, regulamentos, fotos da prova).</li>
          <li><b>Logística</b> (se você usar): endereço de saída (por exemplo, sua casa), paradas, endereços favoritos, rotas calculadas, dados do veículo (consumo e preço do combustível) e os horários da agenda do dia.</li>
          <li><b>Perfil</b> (opcional): nome, apelido, foto, cidade, equipe, data de nascimento, categoria nas provas, tamanho de camiseta, contato de emergência e tipo sanguíneo.</li>
          <li><b>Notificações</b> (se ativar): o endereço técnico de entrega do seu aparelho, o fuso horário, suas preferências de avisos e o registro dos avisos já enviados.</li>
          <li><b>Agenda por assinatura</b> (se ativar): um link secreto que permite ao seu app de calendário ler nome, data, horário e local das provas.</li>
        </ul>
        <p><b>Dados sensíveis:</b> frequência cardíaca, tipo sanguíneo e esforço percebido são dados de saúde. Eles só existem no app se você os informar ou importar, são usados apenas para mostrar e analisar os seus próprios resultados e o seu modo dia da prova, e nunca são compartilhados para outros fins.</p>

        <h2>4. Para que os dados são usados</h2>
        <ul>
          <li>Mostrar e organizar as suas provas, resultados, objetivos, orçamento e logística.</li>
          <li>Sincronizar entre os seus aparelhos e permitir backup e restauração.</li>
          <li>Calcular rotas, custos de deslocamento e a agenda do dia da prova.</li>
          <li>Enviar os avisos que você escolher (prazos, kit, véspera, orçamento, “Como foi?”).</li>
        </ul>
        <p>O PaceOn <b>não</b> vende dados, <b>não</b> exibe anúncios, <b>não</b> usa ferramentas de análise de comportamento ou rastreamento e <b>não</b> cria perfis para publicidade. A base legal é a execução do serviço que você pediu (art. 7º, V, da LGPD) e, para dados de saúde, o seu consentimento ao informá-los (art. 11, I).</p>

        <h2>5. Com quem os dados são compartilhados</h2>
        <p>Somente com os serviços necessários para o app funcionar, e só a parte necessária:</p>
        <ul>
          <li><b>Supabase</b> — banco de dados, autenticação e armazenamento dos arquivos da sua conta. Cada pessoa só acessa os próprios registros.</li>
          <li><b>Vercel</b> — hospedagem do app e das funções do servidor (endereços IP aparecem nos registros técnicos de acesso).</li>
          <li><b>Busca de endereços e rotas</b> — ao verificar um endereço ou calcular uma rota, o texto do endereço ou o CEP (e, nas rotas, os pontos do trajeto e o horário de saída) é enviado ao serviço configurado: BrasilAPI e ViaCEP (CEP), Photon e Nominatim (OpenStreetMap), OpenRouteService ou Google Maps Platform. Ao usar “minha localização”, as coordenadas atuais são enviadas para descobrir o endereço.</li>
          <li><b>Mapas do OpenStreetMap</b> — as imagens do mapa são baixadas dos servidores do OpenStreetMap, que recebem o seu endereço IP.</li>
          <li><b>Serviços de notificação</b> do seu navegador ou celular (Google, Apple ou Mozilla), que recebem o conteúdo do aviso para entregá-lo.</li>
          <li><b>Google Fonts</b> — as fontes do app são carregadas dos servidores do Google, que recebem o seu endereço IP.</li>
          <li><b>Página de inscrição</b> — ao usar “Preencher pelo link”, o servidor do app abre a página que você indicou para ler nome, data e local da prova.</li>
          <li><b>Login com Google</b> (se usar) — o Google informa ao app o seu e-mail.</li>
          <li><b>Garmin</b> — só se, no futuro, você conectar a sua conta Garmin e autorizar; nesse caso, os treinos que você enviar e as atividades que você autorizar trafegarão entre o PaceOn e o Garmin Connect.</li>
        </ul>
        <p>Alguns desses serviços ficam fora do Brasil; a transferência ocorre para viabilizar o serviço que você solicitou (art. 33, IX, da LGPD).</p>

        <h2>6. Por quanto tempo</h2>
        <ul>
          <li>Os dados da conta ficam guardados enquanto a conta existir.</li>
          <li>O registro técnico de avisos enviados é apagado automaticamente após cerca de 45 dias.</li>
          <li>O link da agenda por assinatura vale até você trocá-lo ou desativá-lo.</li>
          <li>Ao sair da conta, os dados saem do aparelho (continuam na conta). Ao <b>excluir a conta</b>, tudo é apagado da nuvem: provas, objetivos, anexos, perfil, preferências, inscrições de notificação e o link da agenda.</li>
        </ul>

        <h2>7. Seus direitos e como exercê-los</h2>
        <ul>
          <li><b>Acessar e levar seus dados:</b> Ajustes → Backup (arquivo com tudo, inclusive anexos e perfil).</li>
          <li><b>Corrigir:</b> edite diretamente no app.</li>
          <li><b>Apagar:</b> exclua itens no app ou a conta inteira em Ajustes → Conta → Excluir minha conta.</li>
          <li><b>Revogar permissões:</b> desative notificações, a agenda por assinatura, a localização no navegador ou o login com Google a qualquer momento.</li>
          <li>Você também pode pedir informações sobre o tratamento{PRIVACY_CONTACT ? <> pelo e-mail <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a></> : ' pelo contato do responsável'} e reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</li>
        </ul>

        <h2>8. Segurança</h2>
        <p>A comunicação é criptografada (HTTPS). No banco, regras de acesso por usuário impedem que uma pessoa leia os dados de outra. Chaves de serviços externos ficam apenas no servidor, nunca no app. Nenhum sistema é totalmente imune a falhas; em caso de incidente relevante, os titulares afetados serão informados.</p>

        <h2>9. Crianças e adolescentes</h2>
        <p>O PaceOn não é direcionado a menores de 18 anos. Menores só devem usá-lo com autorização e acompanhamento dos responsáveis.</p>

        <h2>10. Mudanças nesta política</h2>
        <p>Quando houver mudança relevante, esta página será atualizada e a data no topo mudará.</p>

        <p style={{ marginTop: 24 }}><Link to="/" className="btn btn-block">Voltar ao app</Link></p>
      </article>
    </>
  )
}
