import { apiClient } from './httpClient'

function getXmlText(document, selector) {
  return document.querySelector(selector)?.textContent?.trim() ?? ''
}

function parseRiseSetXml(xml) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const resultCode = getXmlText(document, 'resultCode')
  const serviceError = getXmlText(document, 'errMsg') || getXmlText(document, 'returnAuthMsg')
  const item = document.querySelector('items > item')

  if (document.querySelector('parsererror') || resultCode !== '00' || !item) {
    throw new Error(serviceError || getXmlText(document, 'resultMsg') || '출몰시각 데이터가 없습니다.')
  }

  const value = (name) => getXmlText(item, name)
  return {
    location: value('location'),
    locdate: value('locdate'),
    sunrise: value('sunrise'),
    sunset: value('sunset'),
    civilMorning: value('civilm'),
    civilEvening: value('civile'),
    nauticalMorning: value('nautm'),
    nauticalEvening: value('naute'),
    astronomicalMorning: value('astm'),
    astronomicalEvening: value('aste'),
    sunTransit: value('suntransit'),
  }
}

export async function fetchAreaRiseSet(params) {
  const { data } = await apiClient.get('/api/astronomy', {
    params: { pageNo: '1', numOfRows: '10', ...params },
    responseType: 'text',
    headers: { Accept: 'application/xml' },
  })

  return parseRiseSetXml(data)
}
