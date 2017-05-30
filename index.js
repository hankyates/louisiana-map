const MAX_SIZE = 10000

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
    document.querySelectorAll('.bucket-' + i).forEach(el => el.classList.remove('bucket-' + i))
  }
}

let setColor = ([key, value]) => {
  let parishEl = document.querySelector('path.parish-' + key.padStart(3, '0'))
  if (parishEl) {
    parishEl.classList.add('bucket-' + value)
  } else {
    console.error(key, value)
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
      let percentageParishesByBucket = mapBuckets(parishPercentageMap)
      let updateColors = parishes => _.entries(parishes).forEach(setColor)

      updateColors(filterByParish(percentageParishesByBucket))

    })

resizeHandler()
window.onresize = resizeHandler

