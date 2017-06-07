const MAX_SIZE = 10000

// [r, g, b]
const SMALL_COLOR = [239, 243, 255] // #eff3ff
const LARGE_COLOR = [8, 81, 156] // #08519c

let pickHex = _.curry((color1, color2, percentage) => {
    let p = percentage;
    let w = (p / 100) * 2 - 1;
    let w1 = (w/1+1) / 2;
    let w2 = 1 - w1;
    let rgb = [Math.round(color1[0] * w1 + color2[0] * w2),
            Math.round(color1[1] * w1 + color2[1] * w2),
            Math.round(color1[2] * w1 + color2[2] * w2)];
    return rgb;
})

let getColor = pickHex(LARGE_COLOR, SMALL_COLOR)

var move = (x, y) =>
  Array.from(
    document.querySelectorAll('path')
  ).map(p => {
    var value = p.attributes.d.value
    var newValue = value
      .split(' ')[1]
      .split(',')
      .map(parseFloat)
      .map((n, i) => i === 0 ?
        n + x :
        n + y
      ).join(',')
    return p.attributes.d.value = value.split(' ').map((pp, i) => i ===1 ? pp = newValue : pp).join(' ')
  })

var resizeHandler = () => {
  var svgWidth = window.innerWidth * 0.8
  var svg = document.querySelector('#louisiana-map')

  svg.style.width = svg.style.height = svgWidth
  document.querySelector('#parish-group').style.transform = 'scale(' + svgWidth / 105 + ') rotate(1.6deg)'
  svg.style.display = 'block'
}

let createQuestion = _.curry((questionPath, keyword, value) => ({
  "term": {
    [questionPath + ".value" + (keyword ? ".keyword" : "")]: { value }
  }
}))

let sexQuestion = createQuestion('demographics.SEX', false)
let alcoholQuestion = createQuestion('alcohol_consumption.ALCDAY5', true)
let tobaccoQuestion = createQuestion('tobacco_use.KDAY2', true)

let createSearch = questions => ({
  "aggs": {
    "total_by_parish": {
      "terms": {
        "field": "demographics.CTYCODE1.value.keyword",
        "size": MAX_SIZE
      }
    },
    "question_by_parish": {
      "filter": {
        "bool": {
          "must": questions
        }
      },
      "aggs": {
        "filtered_results": {
          "terms": {
            "field": "demographics.CTYCODE1.value.keyword",
            "size": MAX_SIZE
          }
        }
      }
    }
  }
})

let state = new Map()
state.set(sexQuestion, '')
state.set(tobaccoQuestion, '')
state.set(alcoholQuestion, '')

let onChangeHandler = s => updateMap(
  createSearch(
    _.entries(s)
      .filter(([field, value]) => !!value)
      .map(([field, value]) => field(value))
  )
)

let createHandler = field => _.pipe(
  e => state.set(field, e.target.value),
  onChangeHandler
)

let sexChangeHandler = createHandler(sexQuestion)
let tobaccoChangeHandler = createHandler(tobaccoQuestion)
let alcoholChangeHandler = createHandler(alcoholQuestion)

let totalsBuckets = _.property('aggregations.total_by_parish.buckets')
let parishBuckets = _.property('aggregations.question_by_parish.filtered_results.buckets')

let bucketToMap = (acc, {doc_count, key}) => _.assignAll({}, acc, {[key]: doc_count})
let createMap = prop => json => prop(json).reduce(bucketToMap, {})
let percentage = (a, b) => parseInt((a / b) * 100)
let mapBuckets = _.mapValues(percentage => parseInt(percentage / BUCKET_SIZE) - 1)
let filterByKey = filterValues => map => _.fromPairs(_.entries(map).filter(([key, values]) => !filterValues.includes(key)))
let nonParishCodes = ['888', "Don't Know/Not Sure", "Refused"]
let filterByParish = filterByKey(nonParishCodes)


const BUCKET_SIZE = 100 / 5

let resetColors = () => {
  for (var i = 0, len = BUCKET_SIZE; i < len; i++) {
    document.querySelectorAll('path.bucket-' + i).forEach(el => el.style.fill = '')
  }
}

let fipsToClass = fips => 'parish-' + fips.padStart(3, '0')

let setColor = ([fips, value]) => {
  let parishEl = document.querySelector('path.' + fipsToClass(fips))
  if (parishEl) {
    parishEl.style.fill = 'rgb(' + getColor(value) + ')'
  } else {
    console.error(fips, value.join(','))
  }
}

let updateMap = search =>
  fetch(
    'https://crdb-1096007071.us-east-1.bonsaisearch.net/test_brfss/_search?size=0',
    {
      method: 'POST',
      headers: {
        "Authorization": localStorage.getItem('es-auth')
      },
      body: JSON.stringify(search)
    }
  )
    .then(r => r.json())
    .then(json => {
      resetColors()
      let totalsMap = createMap(totalsBuckets)(json)
      let parishMap = createMap(parishBuckets)(json)
      let parishPercentageMap = _.fromPairs(
        _.entries(parishMap).map(([parishKey, parishValue]) => [parishKey, percentage(parishValue, _.prop(parishKey, totalsMap))])
      )
      let updateColors = parishes => _.entries(parishes).forEach(setColor)
      let createParishClassMap = parishes => _.mapKeys(fips => fipsToClass(fips), parishes)

      state.set('totalsMap', createParishClassMap(totalsMap))
      state.set('parishMap', createParishClassMap(parishMap))

      updateColors(filterByParish(parishPercentageMap))

    })

let hoverInfo = document.querySelector('#hover-info')
let parishName = document.querySelector('.parish-name')
let parishTotal = document.querySelector('.parish-total')
let parishQuestionTotal = document.querySelector('.parish-question-number')

var formatThousands = function(n, dp){
  var s = ''+(Math.floor(n)), d = n % 1, i = s.length, r = '';
  while ( (i -= 3) > 0 ) { r = ',' + s.substr(i, 3) + r; }
  return s.substr(0, i + 3) + r + 
    (d ? '.' + Math.round(d * Math.pow(10, dp || 2)) : '');
}; 

let mouseOverHandler = e => {
  hoverInfo.style.visibility = 'visible'
  parishName.innerHTML = e.target.id
  let filtered = state.get('parishMap')[e.target.classList[0]]
  let total = state.get('totalsMap')[e.target.classList[0]]
  let perOneHundredThousand = formatThousands(((100000 * filtered) / total || 0).toFixed(2))
  parishTotal.innerHTML = filtered || 0
  parishQuestionTotal.innerHTML = perOneHundredThousand
}
let mouseOutHandler = e => {
  hoverInfo.style.visibility = 'hidden'
}
let mouseMoveHandler = e => {
  let x = e.offsetX - 100
  let y = e.offsetY - 150
  hoverInfo.style.top = y + 'px'
  hoverInfo.style.left = x + 'px'
}

let handlers = {
  mouseover: mouseOverHandler,
  mouseout: mouseOutHandler,
  mousemove: mouseMoveHandler
}

let attachListeners = el => _.entries(handlers).forEach(([eventType, handler]) => el.addEventListener(eventType, handler))

document.querySelectorAll('#parish-group path').forEach(attachListeners)

resizeHandler()
window.onresize = resizeHandler

