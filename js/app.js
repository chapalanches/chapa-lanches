const numeroWhatsapp = (window.APP_CONFIG && window.APP_CONFIG.whatsappNumber) || '5515996179172';
  const nomeLoja = (window.APP_CONFIG && window.APP_CONFIG.storeName) || 'Chapa Lanches';
  const ENDERECO_LOJA_PADRAO = 'Avenida Doutor Artur Bernardes, 235, Vila Gabriel, Sorocaba, SP, Brasil, 18081-000';

  const REGRAS_ENTREGA_PADRAO = [
    { km_min: 0, km_max: 3, fee: 4, active: true },
    { km_min: 3.01, km_max: 4, fee: 5, active: true },
    { km_min: 4.01, km_max: 5, fee: 6, active: true },
    { km_min: 5.01, km_max: 6, fee: 7, active: true },
    { km_min: 6.01, km_max: 7, fee: 8, active: true },
    { km_min: 7.01, km_max: 8, fee: 9, active: true },
    { km_min: 8.01, km_max: 9, fee: 10, active: true },
    { km_min: 9.01, km_max: 10, fee: 11, active: true }
  ];

  let supabaseClient = null;

  if (
    window.supabase &&
    window.APP_CONFIG &&
    window.APP_CONFIG.supabaseUrl &&
    window.APP_CONFIG.supabaseAnonKey
  ) {
    supabaseClient = window.supabase.createClient(
      window.APP_CONFIG.supabaseUrl,
      window.APP_CONFIG.supabaseAnonKey
    );
  }

  let carrinho = [];
  let taxaEntrega = 0;
  let distanciaEntregaKm = null;
  let tempoEntregaTexto = null;
  let regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
  let configuracaoLoja = null;
  let timeoutCalculoEntrega = null;

  let googleMapsReady = false;
  let geocoder = null;
  let distanceMatrixService = null;
  let carregandoGoogleMaps = null;

  function formatarPreco(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function somenteNumeros(texto) {
    return (texto || '').replace(/\D/g, '');
  }

  function formatarTipoEntregaTexto(tipo) {
    return tipo === 'delivery' ? 'Delivery' : 'Retirada no local';
  }

  function aplicarMascaraCep() {
    const input = document.getElementById('cepEntrega');

    input.addEventListener('input', function () {
      let valor = somenteNumeros(input.value).slice(0, 8);

      if (valor.length > 5) {
        valor = valor.slice(0, 5) + '-' + valor.slice(5);
      }

      input.value = valor;
      agendarCalculoEntrega();
    });
  }

  function aplicarEventosEntrega() {
    const ids = [
      'ruaEntrega',
      'numeroEntrega',
      'bairroEntrega',
      'cidadeEntrega',
      'complementoEntrega'
    ];

    ids.forEach(id => {
      const campo = document.getElementById(id);
      if (!campo) return;

      campo.addEventListener('input', agendarCalculoEntrega);
      campo.addEventListener('change', agendarCalculoEntrega);
      campo.addEventListener('blur', agendarCalculoEntrega);
    });
  }

  function agendarCalculoEntrega() {
    clearTimeout(timeoutCalculoEntrega);
    timeoutCalculoEntrega = setTimeout(() => {
      calcularEntregaAutomaticamente();
    }, 700);
  }

  function montarEnderecoCompletoCliente() {
    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
    const cep = document.getElementById('cepEntrega').value.trim();

    return `${rua}, ${numero}, ${bairro}, ${cidade}, SP, Brasil, ${cep}`;
  }

  function enderecoClienteTextoHumano() {
    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
    const cep = document.getElementById('cepEntrega').value.trim();
    const complemento = document.getElementById('complementoEntrega').value.trim();

    let texto = `${rua}, ${numero}, ${bairro}, ${cidade}, CEP ${cep}`;

    if (complemento) {
      texto += `, ${complemento}`;
    }

    return texto;
  }

  async function buscarCepEntrega() {
    const cep = somenteNumeros(document.getElementById('cepEntrega').value);
    const avisoEntrega = document.getElementById('avisoEntrega');

    if (cep.length !== 8) return;

    try {
      avisoEntrega.innerText = 'Consultando CEP...';

      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();

      if (dados.erro) {
        avisoEntrega.innerText = 'CEP não encontrado. Confira o número digitado.';
        return;
      }

      if (!document.getElementById('ruaEntrega').value.trim()) {
        document.getElementById('ruaEntrega').value = dados.logradouro || '';
      }

      if (!document.getElementById('bairroEntrega').value.trim()) {
        document.getElementById('bairroEntrega').value = dados.bairro || '';
      }

      if (!document.getElementById('cidadeEntrega').value.trim()) {
        document.getElementById('cidadeEntrega').value = dados.localidade || 'Sorocaba';
      }

      avisoEntrega.innerText = 'CEP localizado. Informe o número para calcular a taxa.';
      await calcularEntregaAutomaticamente();
    } catch (erro) {
      console.error(erro);
      avisoEntrega.innerText = 'Não foi possível consultar o CEP agora.';
    }
  }

  function atualizarContadores() {
    const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    document.getElementById('cartCount').innerText = totalItens;
  }

  function adicionarAoCarrinho(nome, preco) {
    const itemExistente = carrinho.find(item => item.nome === nome);

    if (itemExistente) {
      itemExistente.quantidade += 1;
    } else {
      carrinho.push({
        nome,
        preco,
        quantidade: 1
      });
    }

    atualizarContadores();
  }

  function aumentarQuantidade(index) {
    carrinho[index].quantidade += 1;
    renderizarCarrinho();
  }

  function diminuirQuantidade(index) {
    carrinho[index].quantidade -= 1;

    if (carrinho[index].quantidade <= 0) {
      carrinho.splice(index, 1);
    }

    renderizarCarrinho();
  }

  function removerItem(index) {
    carrinho.splice(index, 1);
    renderizarCarrinho();
  }

  function calcularSubtotal() {
    return carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
  }

  function calcularTotal() {
    return calcularSubtotal() + taxaEntrega;
  }

  function lojaAbertaAgora() {
    const agora = new Date();
    const dia = agora.getDay();

    if (dia !== 0 && dia !== 3 && dia !== 4 && dia !== 5 && dia !== 6) {
      return false;
    }

    const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
    const abre = 19 * 60;
    const fecha = 22 * 60 + 30;

    return minutosAgora >= abre && minutosAgora < fecha;
  }

  function atualizarStatusLoja() {
    const statusLoja = document.getElementById('statusLoja');
    const btnFinalizar = document.getElementById('btnFinalizar');
    const aberta = lojaAbertaAgora();

    if (aberta) {
      statusLoja.classList.remove('fechado');
      statusLoja.classList.add('aberto');
      statusLoja.innerText = '🟢 Aberto agora';
      btnFinalizar.disabled = false;
    } else {
      statusLoja.classList.remove('aberto');
      statusLoja.classList.add('fechado');
      statusLoja.innerText = '🔴 Fechado no momento';
      btnFinalizar.disabled = true;
    }
  }

  function atualizarEntrega() {
    const tipoEntrega = document.getElementById('tipoEntrega').value;
    const camposEntrega = document.getElementById('camposEntrega');
    const avisoEntrega = document.getElementById('avisoEntrega');

    if (tipoEntrega === 'delivery') {
      camposEntrega.style.display = 'grid';

      const rua = document.getElementById('ruaEntrega').value.trim();
      const numero = document.getElementById('numeroEntrega').value.trim();
      const bairro = document.getElementById('bairroEntrega').value.trim();
      const cidade = document.getElementById('cidadeEntrega').value.trim();

      if (!rua || !numero || !bairro || !cidade) {
        taxaEntrega = 0;
        distanciaEntregaKm = null;
        tempoEntregaTexto = null;
        avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
      } else {
        agendarCalculoEntrega();
      }
    } else {
      camposEntrega.style.display = 'none';
      document.getElementById('cepEntrega').value = '';
      document.getElementById('ruaEntrega').value = '';
      document.getElementById('numeroEntrega').value = '';
      document.getElementById('bairroEntrega').value = '';
      document.getElementById('cidadeEntrega').value = 'Sorocaba';
      document.getElementById('complementoEntrega').value = '';
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }

    renderizarCarrinho();
  }

  function renderizarCarrinho() {
    const lista = document.getElementById('listaCarrinho');
    const subtotal = calcularSubtotal();
    const total = calcularTotal();

    if (carrinho.length === 0) {
      lista.innerHTML = '<div class="carrinho-vazio">Seu carrinho está vazio.</div>';
    } else {
      lista.innerHTML = `
        <div class="lista-carrinho">
          ${carrinho.map((item, index) => `
            <div class="item-carrinho">
              <div>
                <strong>${item.nome}</strong>
                <small>${formatarPreco(item.preco)} cada</small>
              </div>
              <div class="acoes-carrinho">
                <div class="qtd-box">
                  <button class="qtd-btn" onclick="diminuirQuantidade(${index})">-</button>
                  <strong>${item.quantidade}</strong>
                  <button class="qtd-btn" onclick="aumentarQuantidade(${index})">+</button>
                </div>
                <strong>${formatarPreco(item.preco * item.quantidade)}</strong>
                <button class="btn-remover" onclick="removerItem(${index})">Remover</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    document.getElementById('resumoItens').innerText = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
    document.getElementById('resumoSubtotal').innerText = formatarPreco(subtotal);
    document.getElementById('resumoTaxaEntrega').innerText = formatarPreco(taxaEntrega);
    document.getElementById('resumoTotal').innerText = formatarPreco(total);

    atualizarContadores();
    atualizarStatusLoja();
  }

  function abrirCarrinho() {
    renderizarCarrinho();
    document.getElementById('modalCarrinho').classList.add('ativo');
  }

  function fecharCarrinho() {
    document.getElementById('modalCarrinho').classList.remove('ativo');
  }

  function limparCarrinho() {
    carrinho = [];
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    document.getElementById('nomeCliente').value = '';
    document.getElementById('tipoEntrega').value = 'retirada';
    document.getElementById('cepEntrega').value = '';
    document.getElementById('ruaEntrega').value = '';
    document.getElementById('numeroEntrega').value = '';
    document.getElementById('bairroEntrega').value = '';
    document.getElementById('cidadeEntrega').value = 'Sorocaba';
    document.getElementById('complementoEntrega').value = '';
    document.getElementById('formaPagamento').value = '';
    document.getElementById('observacoes').value = '';
    atualizarEntrega();
    renderizarCarrinho();
  }

  async function carregarRegrasEntrega() {
    if (!supabaseClient) {
      regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('delivery_rules')
        .select('*')
        .eq('active', true)
        .order('km_min', { ascending: true });

      if (error) {
        console.error('Erro ao carregar regras de entrega:', error);
        regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
        return;
      }

      regrasEntrega = data && data.length > 0 ? data : [...REGRAS_ENTREGA_PADRAO];
    } catch (erro) {
      console.error('Falha ao carregar regras:', erro);
      regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
    }
  }

  async function carregarConfiguracaoLoja() {
    if (!supabaseClient) {
      configuracaoLoja = {
        store_address: ENDERECO_LOJA_PADRAO,
        store_lat: null,
        store_lng: null
      };
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('store_settings')
        .select('*')
        .limit(1);

      if (error) {
        console.error('Erro ao carregar configuração da loja:', error);
        configuracaoLoja = {
          store_address: ENDERECO_LOJA_PADRAO,
          store_lat: null,
          store_lng: null
        };
        return;
      }

      configuracaoLoja = (data && data.length > 0)
        ? data[0]
        : {
            store_address: ENDERECO_LOJA_PADRAO,
            store_lat: null,
            store_lng: null
          };
    } catch (erro) {
      console.error('Falha ao carregar configuração:', erro);
      configuracaoLoja = {
        store_address: ENDERECO_LOJA_PADRAO,
        store_lat: null,
        store_lng: null
      };
    }
  }

  function carregarGoogleMapsScript() {
    if (googleMapsReady && window.google && window.google.maps) {
      return Promise.resolve();
    }

    if (carregandoGoogleMaps) {
      return carregandoGoogleMaps;
    }

    carregandoGoogleMaps = new Promise((resolve, reject) => {
      if (!window.APP_CONFIG || !window.APP_CONFIG.googleMapsApiKey) {
        reject(new Error('Google Maps API Key não configurada no config.js.'));
        return;
      }

      if (window.google && window.google.maps) {
        googleMapsReady = true;
        geocoder = new google.maps.Geocoder();
        distanceMatrixService = new google.maps.DistanceMatrixService();
        resolve();
        return;
      }

      window.__initGoogleMapsDelivery = function () {
        googleMapsReady = true;
        geocoder = new google.maps.Geocoder();
        distanceMatrixService = new google.maps.DistanceMatrixService();
        resolve();
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${window.APP_CONFIG.googleMapsApiKey}&libraries=places&callback=__initGoogleMapsDelivery`;
      script.async = true;
      script.defer = true;
      script.onerror = function () {
        reject(new Error('Erro ao carregar Google Maps.'));
      };
      document.head.appendChild(script);
    });

    return carregandoGoogleMaps;
  }

async function geocodificarEnderecoProfissional(endereco) {
  try {
    let resultado = await geocodificarComGoogle(endereco);
    if (resultado) return resultado;
  } catch (erro) {
    console.warn('Tentativa 1 falhou:', erro.message);
  }

  try {
    const enderecoSemNumero = endereco.replace(/,\s*\d+\s*,/g, ', ');
    let resultado = await geocodificarComGoogle(enderecoSemNumero);
    if (resultado) return resultado;
  } catch (erro) {
    console.warn('Tentativa 2 falhou:', erro.message);
  }

  return null;
}

  async function geocodificarEnderecoProfissional(endereco) {
    let resultado = await geocodificarComGoogle(endereco);

    if (resultado) return resultado;

    const enderecoSemNumero = endereco.replace(/,\s*\d+\s*,/g, ', ');
    resultado = await geocodificarComGoogle(enderecoSemNumero);

    if (resultado) return resultado;

    return null;
  }

  function calcularRotaRealGoogle(origem, destino) {
    return new Promise((resolve, reject) => {
      if (!distanceMatrixService) {
        reject(new Error('Distance Matrix não inicializado.'));
        return;
      }

      distanceMatrixService.getDistanceMatrix(
        {
          origins: [origem],
          destinations: [destino],
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.METRIC,
          region: 'BR',
          avoidHighways: false,
          avoidTolls: false
        },
        (response, status) => {
          if (status !== 'OK' || !response || !response.rows || !response.rows.length) {
            reject(new Error('Não foi possível calcular a rota.'));
            return;
          }

          const elemento = response.rows[0].elements[0];

          if (!elemento || elemento.status !== 'OK') {
            reject(new Error('Rota não encontrada para este endereço.'));
            return;
          }

          resolve({
            distanciaMetros: elemento.distance.value,
            distanciaTexto: elemento.distance.text,
            duracaoSegundos: elemento.duration.value,
            duracaoTexto: elemento.duration.text
          });
        }
      );
    });
  }

  function descobrirTaxaPorDistancia(distanciaKm) {
    if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) {
      return 0;
    }

    if (regrasEntrega && regrasEntrega.length > 0) {
      const regra = regrasEntrega.find(r => {
        const min = Number(r.km_min);
        const max = Number(r.km_max);
        return distanciaKm >= min && distanciaKm <= max;
      });

      if (regra) {
        return Number(regra.fee);
      }
    }

    if (distanciaKm <= 3) {
      return 4;
    }

    return 4 + Math.ceil(distanciaKm - 3);
  }

  async function calcularEntregaAutomaticamente() {
    const tipoEntrega = document.getElementById('tipoEntrega').value;
    const avisoEntrega = document.getElementById('avisoEntrega');

    if (tipoEntrega !== 'delivery') {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
      renderizarCarrinho();
      return;
    }

    const cep = document.getElementById('cepEntrega').value.trim();
    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim();

    if (!cep || !rua || !numero || !bairro || !cidade) {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
      renderizarCarrinho();
      return;
    }

    avisoEntrega.innerText = 'Calculando rota real e taxa de entrega...';

    try {
      await carregarGoogleMapsScript();

      const enderecoLoja = configuracaoLoja?.store_address || ENDERECO_LOJA_PADRAO;
      const enderecoCliente = montarEnderecoCompletoCliente();

      let coordenadaLoja = null;

      if (configuracaoLoja?.store_lat && configuracaoLoja?.store_lng) {
        coordenadaLoja = {
          lat: Number(configuracaoLoja.store_lat),
          lng: Number(configuracaoLoja.store_lng),
          display_name: enderecoLoja
        };
      } else {
        coordenadaLoja = await geocodificarEnderecoProfissional(enderecoLoja);
      }

      const coordenadaCliente = await geocodificarEnderecoProfissional(enderecoCliente);

      if (!coordenadaLoja || !coordenadaCliente) {
        taxaEntrega = 0;
        distanciaEntregaKm = null;
        tempoEntregaTexto = null;
        avisoEntrega.innerText = 'Não foi possível localizar o endereço. Confira os dados digitados.';
        renderizarCarrinho();
        return;
      }

      const rota = await calcularRotaRealGoogle(
        new google.maps.LatLng(coordenadaLoja.lat, coordenadaLoja.lng),
        new google.maps.LatLng(coordenadaCliente.lat, coordenadaCliente.lng)
      );

      distanciaEntregaKm = Number((rota.distanciaMetros / 1000).toFixed(2));
      tempoEntregaTexto = rota.duracaoTexto || null;
      taxaEntrega = descobrirTaxaPorDistancia(distanciaEntregaKm);

      avisoEntrega.innerText =
        `Distância real: ${distanciaEntregaKm.toFixed(2)} km | Tempo estimado: ${tempoEntregaTexto || '-'} | Taxa: ${formatarPreco(taxaEntrega)}`;

      renderizarCarrinho();
    } catch (erro) {
      console.error('Erro ao calcular entrega profissional:', erro);
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      avisoEntrega.innerText = 'Erro ao calcular a entrega. Verifique a chave do Google Maps e o endereço.';
      renderizarCarrinho();
    }
  }

  async function salvarPedidoNoBanco(payload) {
    if (!supabaseClient) {
      return { id: Date.now() };
    }

    const { data, error } = await supabaseClient
      .from('orders')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Erro ao salvar pedido:', error);
      throw error;
    }

    return data;
  }

  async function finalizarPedido() {
    if (carrinho.length === 0) {
      alert('Seu carrinho está vazio.');
      return;
    }

    if (!lojaAbertaAgora()) {
      alert('A loja está fechada no momento.');
      return;
    }

    const nome = document.getElementById('nomeCliente').value.trim();
    const tipoEntrega = document.getElementById('tipoEntrega').value;
    const pagamento = document.getElementById('formaPagamento').value;
    const observacoes = document.getElementById('observacoes').value.trim();
    const avisoEntrega = document.getElementById('avisoEntrega');
    const btnFinalizar = document.getElementById('btnFinalizar');

    const endereco = enderecoClienteTextoHumano();

    if (!nome) {
      alert('Digite seu nome.');
      return;
    }

    if (tipoEntrega === 'delivery') {
      const cep = document.getElementById('cepEntrega').value.trim();
      const rua = document.getElementById('ruaEntrega').value.trim();
      const numero = document.getElementById('numeroEntrega').value.trim();
      const bairro = document.getElementById('bairroEntrega').value.trim();
      const cidade = document.getElementById('cidadeEntrega').value.trim();

      if (!cep || !rua || !numero || !bairro || !cidade) {
        alert('Preencha CEP, rua, número, bairro e cidade.');
        return;
      }

      if (distanciaEntregaKm === null) {
        await calcularEntregaAutomaticamente();
      }

      if (distanciaEntregaKm === null) {
        alert('Não foi possível calcular a entrega. Verifique o endereço.');
        return;
      }
    }

    const subtotal = calcularSubtotal();
    const total = calcularTotal();

    const payload = {
      customer_name: nome,
      customer_phone: '',
      order_type: tipoEntrega,
      customer_address: tipoEntrega === 'delivery' ? endereco : null,
      customer_neighborhood: tipoEntrega === 'delivery' ? document.getElementById('bairroEntrega').value.trim() : null,
      customer_city: tipoEntrega === 'delivery' ? document.getElementById('cidadeEntrega').value.trim() : 'Sorocaba',
      customer_notes: [
        pagamento ? `Pagamento: ${pagamento}` : '',
        observacoes ? `Observações: ${observacoes}` : '',
        tipoEntrega === 'delivery' && document.getElementById('complementoEntrega').value.trim()
          ? `Complemento: ${document.getElementById('complementoEntrega').value.trim()}`
          : '',
        tipoEntrega === 'delivery' && tempoEntregaTexto
          ? `Tempo estimado: ${tempoEntregaTexto}`
          : ''
      ].filter(Boolean).join(' | '),
      items: carrinho.map(item => ({
        nome: item.nome,
        preco: item.preco,
        quantidade: item.quantidade
      })),
      subtotal: subtotal,
      delivery_fee: taxaEntrega,
      total: total,
      delivery_distance_km: tipoEntrega === 'delivery' ? distanciaEntregaKm : null,
      status: 'novo'
    };

    try {
      btnFinalizar.disabled = true;
      btnFinalizar.innerText = 'Salvando pedido...';

      const pedidoSalvo = await salvarPedidoNoBanco(payload);

      let mensagem = '🍔 *Pedido - ' + encodeURIComponent(nomeLoja) + '*%0A%0A';
      mensagem += '*Pedido:* #' + pedidoSalvo.id + '%0A';
      mensagem += '*Cliente:* ' + encodeURIComponent(nome) + '%0A';
      mensagem += '*Tipo do pedido:* ' + encodeURIComponent(formatarTipoEntregaTexto(tipoEntrega)) + '%0A';

      if (tipoEntrega === 'delivery') {
        mensagem += '*Endereço:* ' + encodeURIComponent(endereco) + '%0A';
        mensagem += '*Distância real:* ' + encodeURIComponent(distanciaEntregaKm.toFixed(2) + ' km') + '%0A';

        if (tempoEntregaTexto) {
          mensagem += '*Tempo estimado:* ' + encodeURIComponent(tempoEntregaTexto) + '%0A';
        }
      }

      mensagem += '%0A*Itens do pedido:*%0A';

      carrinho.forEach(item => {
        mensagem += '- ' + encodeURIComponent(item.quantidade + 'x ' + item.nome + ' — ' + formatarPreco(item.preco * item.quantidade)) + '%0A';
      });

      mensagem += '%0A*Subtotal:* ' + encodeURIComponent(formatarPreco(subtotal)) + '%0A';
      mensagem += '*Taxa de entrega:* ' + encodeURIComponent(formatarPreco(taxaEntrega)) + '%0A';
      mensagem += '*Total:* ' + encodeURIComponent(formatarPreco(total)) + '%0A';

      if (pagamento) {
        mensagem += '*Pagamento:* ' + encodeURIComponent(pagamento) + '%0A';
      }

      if (observacoes) {
        mensagem += '*Observações:* ' + encodeURIComponent(observacoes) + '%0A';
      }

      window.open('https://wa.me/' + numeroWhatsapp + '?text=' + mensagem, '_blank');

      carrinho = [];
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;
      document.getElementById('nomeCliente').value = '';
      document.getElementById('tipoEntrega').value = 'retirada';
      document.getElementById('cepEntrega').value = '';
      document.getElementById('ruaEntrega').value = '';
      document.getElementById('numeroEntrega').value = '';
      document.getElementById('bairroEntrega').value = '';
      document.getElementById('cidadeEntrega').value = 'Sorocaba';
      document.getElementById('complementoEntrega').value = '';
      document.getElementById('formaPagamento').value = '';
      document.getElementById('observacoes').value = '';
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
      fecharCarrinho();
      renderizarCarrinho();

      alert('Pedido salvo com sucesso no painel!');
    } catch (erro) {
      alert('Erro ao salvar o pedido. Verifique a configuração do Supabase.');
      console.error(erro);
    } finally {
      btnFinalizar.innerText = 'Finalizar no WhatsApp';
      btnFinalizar.disabled = !lojaAbertaAgora();
    }
  }

  window.onclick = function (event) {
    const modal = document.getElementById('modalCarrinho');
    if (event.target === modal) {
      fecharCarrinho();
    }
  };

  async function iniciarSistema() {
    await carregarConfiguracaoLoja();
    await carregarRegrasEntrega();
    aplicarMascaraCep();
    aplicarEventosEntrega();
    atualizarContadores();
    atualizarEntrega();
    atualizarStatusLoja();
    setInterval(atualizarStatusLoja, 60000);

    try {
      await carregarGoogleMapsScript();
      console.log('Google Maps carregado com sucesso.');
    } catch (erro) {
      console.error('Google Maps não carregado:', erro);
    }
  }

  iniciarSistema();
