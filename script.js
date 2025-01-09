document.addEventListener('DOMContentLoaded', () => {
  const simulationForm = document.getElementById('simulationForm')
  const valorInvestidoInput = document.getElementById('valorInvestido')
  const dataInvestimentoInput = document.getElementById('dataInvestimento')
  const periodoDiasInput = document.getElementById('periodoDias')
  const nivelSelect = document.getElementById('nivelSelect')
  const projectionList = document.getElementById('projectionList')
  const resultSection = document.getElementById('result')
  const loadingIndicator = document.getElementById('loading')
  const taxaAnualDisplay = document.getElementById('taxaAnualDisplay')
  const feriadosTableBody = document.getElementById('feriadosTableBody')
  const rendimentoChartCtx = document.getElementById('rendimentoChart').getContext('2d')
  const rentabilidadeDiariaChartCtx = document.getElementById('rentabilidadeDiariaChart').getContext('2d')
  let rendimentoChartInstance = null
  let rentabilidadeDiariaChartInstance = null

  const formatarValor = (valor) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  const isDiaUtil = (ano, mes, dia) => {
    const date = new Date(Date.UTC(ano, mes - 1, dia))
    const weekDay = date.getUTCDay()
    return weekDay !== 0 && weekDay !== 6
  }

  const obterFeriadosNacionais = async (ano) => {
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`)
    if (!response.ok) throw new Error()
    return await response.json()
  }

  const obterTaxaDiaria = async (ano) => {
    const dataInicial = `01/01/${ano}`
    const dataFinal = `31/12/${ano}`
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${dataInicial}&dataFinal=${dataFinal}`
    const response = await fetch(url)
    if (!response.ok) throw new Error()
    const data = await response.json()
    if (data.length === 0) throw new Error()
    data.sort((a, b) => {
      const [diaA, mesA, anoA] = a.data.split('/').map(num => parseInt(num, 10))
      const [diaB, mesB, anoB] = b.data.split('/').map(num => parseInt(num, 10))
      return new Date(anoA, mesA - 1, diaA) - new Date(anoB, mesB - 1, diaB)
    })
    const ultimaTaxa = parseFloat(data[data.length - 1].valor)
    return ultimaTaxa / 100
  }

  const obterAliquotaIR = (dias) => {
    if (dias <= 180) return 0.225
    else if (dias <= 360) return 0.20
    else if (dias <= 720) return 0.175
    else return 0.15
  }

  const adicionarDias = (data, dias) => {
    const [ano, mes, dia] = data.split('-').map(v => parseInt(v, 10))
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    d.setUTCDate(d.getUTCDate() + dias)
    const anoNovo = d.getUTCFullYear()
    const mesNovo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const diaNovo = String(d.getUTCDate()).padStart(2, '0')
    return `${anoNovo}-${mesNovo}-${diaNovo}`
  }

  const formatarDataPtBr = (dataIso) => {
    const [ano, mes, dia] = dataIso.split('-')
    return `${dia}/${mes}/${ano}`
  }

  simulationForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    let valorInvestido = parseFloat(valorInvestidoInput.value.replace(/[^0-9,-]+/g, '').replace(',', '.'))
    const dataInvest = dataInvestimentoInput.value
    const periodoDias = parseInt(periodoDiasInput.value, 10)
    const fatorCDI = parseFloat(nivelSelect.value)
    if (isNaN(valorInvestido) || isNaN(periodoDias) || !/^\d{4}-\d{2}-\d{2}$/.test(dataInvest) || isNaN(fatorCDI)) {
      alert('Preencha todos os campos corretamente.')
      return
    }
    projectionList.innerHTML = ''
    feriadosTableBody.innerHTML = ''
    resultSection.style.display = 'none'
    loadingIndicator.style.display = 'block'
    const feriadosMap = new Map()
    const feriadosSet = new Set()
    const carregarFeriadosAno = async (ano) => {
      if (!feriadosMap.has(ano)) {
        const feriadosNacionais = await obterFeriadosNacionais(ano)
        feriadosMap.set(ano, feriadosNacionais)
        feriadosNacionais.forEach(feriado => feriadosSet.add(feriado.date))
      }
    }
    const anoInicial = parseInt(dataInvest.split('-')[0], 10)
    await carregarFeriadosAno(anoInicial)
    let taxaDiariaDecimal
    try {
      taxaDiariaDecimal = await obterTaxaDiaria(anoInicial)
    } catch (e) {
      loadingIndicator.style.display = 'none'
      alert('Não foi possível obter a Taxa Diária (CDI).')
      return
    }
    loadingIndicator.style.display = 'none'
    const taxaDiariaFinal = taxaDiariaDecimal * fatorCDI
    const cdiAnual = Math.pow(1 + taxaDiariaFinal, 252) - 1
    taxaAnualDisplay.textContent = (cdiAnual * 100).toFixed(2)
    const aliquotaIR = obterAliquotaIR(periodoDias)
    let saldoBruto = valorInvestido
    let saldoLiquido = valorInvestido
    let diasContados = 0
    let dataAtual = dataInvest
    const labels = []
    const dadosBrutos = []
    const dadosLiquidos = []
    const variacaoDiaria = []
    let valorAnterior = valorInvestido
    const datasSimuladas = []

    while (diasContados < periodoDias) {
      dataAtual = adicionarDias(dataAtual, 1)
      const [ano, mes, dia] = dataAtual.split('-').map(v => parseInt(v, 10))
      if (!feriadosMap.has(ano)) await carregarFeriadosAno(ano)
      if (isDiaUtil(ano, mes, dia) && !feriadosSet.has(dataAtual)) {
        diasContados++
        const rendimentoDiaBruto = saldoBruto * taxaDiariaFinal
        const rendimentoDiaLiquido = rendimentoDiaBruto * (1 - aliquotaIR)
        saldoBruto += rendimentoDiaBruto
        saldoLiquido += rendimentoDiaLiquido
        const listItem = document.createElement('li')
        listItem.classList.add('list-group-item')
        listItem.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Dia ${formatarDataPtBr(dataAtual)}</strong><br>
              Rendimento Bruto: ${formatarValor(rendimentoDiaBruto)}<br>
              Rendimento Líquido: ${formatarValor(rendimentoDiaLiquido)}
            </div>
            <span class="badge bg-success">
              ${formatarValor(saldoLiquido)}
            </span>
          </div>
        `
        projectionList.appendChild(listItem)
        labels.push(formatarDataPtBr(dataAtual))
        dadosBrutos.push(saldoBruto.toFixed(2))
        dadosLiquidos.push(saldoLiquido.toFixed(2))
        variacaoDiaria.push((saldoLiquido - valorAnterior).toFixed(2))
        valorAnterior = saldoLiquido
        datasSimuladas.push(dataAtual)
      }
    }

    const inicioSimulacao = datasSimuladas[0]
    const fimSimulacao = datasSimuladas[datasSimuladas.length - 1]
    feriadosMap.forEach(feriadosNacionais => {
      feriadosNacionais.forEach(feriado => {
        if (feriado.date >= inicioSimulacao && feriado.date <= fimSimulacao) {
          const tr = document.createElement('tr')
          tr.innerHTML = `
            <td>${formatarDataPtBr(feriado.date)}</td>
            <td>${feriado.name}</td>
          `
          feriadosTableBody.appendChild(tr)
        }
      })
    })

    resultSection.style.display = 'block'
    if (rendimentoChartInstance) rendimentoChartInstance.destroy()
    rendimentoChartInstance = new Chart(rendimentoChartCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Saldo Bruto (R$)',
            data: dadosBrutos,
            backgroundColor: 'rgba(75, 192, 102, 0.2)',
            borderColor: 'rgba(75, 192, 102, 1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: 'rgba(75, 192, 102, 1)'
          },
          {
            label: 'Saldo Líquido (R$)',
            data: dadosLiquidos,
            backgroundColor: 'rgba(56, 204, 157, 0.2)',
            borderColor: 'rgba(56, 204, 157, 1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: 'rgba(56, 204, 157, 1)'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: { display: true, title: { display: true, text: 'Data' }, ticks: { maxTicksLimit: 10 } },
          y: { display: true, title: { display: true, text: 'Saldo (R$)' }, beginAtZero: false }
        }
      }
    })
    if (rentabilidadeDiariaChartInstance) rentabilidadeDiariaChartInstance.destroy()
    rentabilidadeDiariaChartInstance = new Chart(rentabilidadeDiariaChartCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Rentabilidade Líquida Diária (R$)',
            data: variacaoDiaria,
            backgroundColor: 'rgba(75, 192, 102, 0.5)',
            borderColor: 'rgba(75, 192, 102, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { display: true, title: { display: true, text: 'Data' }, ticks: { maxTicksLimit: 10 } },
          y: { display: true, title: { display: true, text: 'Variação (R$)' }, beginAtZero: true }
        }
      }
    })
    valorInvestidoInput.value = 'R$ ' + saldoLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  })

  valorInvestidoInput.addEventListener('input', (event) => {
    let valor = event.target.value.replace(/\D/g, '')
    valor = (valor / 100).toFixed(2).replace('.', ',')
    valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')
    event.target.value = `R$ ${valor}`
  })

  periodoDiasInput.addEventListener('input', (event) => {
    let valor = event.target.value.replace(/\D/g, '')
    event.target.value = valor
  })
})
