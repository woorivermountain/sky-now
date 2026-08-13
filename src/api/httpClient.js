import axios from 'axios'

// 브라우저에서 사용하는 공통 Axios 인스턴스입니다.
// API별 파일은 주소와 파라미터만 정의하고 시간 제한과 오류 변환은 여기서 공유합니다.
export const apiClient = axios.create({
  timeout: 15_000,
  headers: {
    Accept: 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error.response?.data?.message
    const status = error.response?.status
    const message = serverMessage
      ?? (status ? `API 요청에 실패했습니다. (${status})` : 'API 서버에 연결하지 못했습니다.')

    return Promise.reject(new Error(message, { cause: error }))
  },
)
