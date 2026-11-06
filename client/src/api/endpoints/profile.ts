import { http } from '../http'
import { USE_MOCK } from '../config'
import type { Profile, Resume } from '../../types'

const MOCK_PROFILE: Profile = {
  user_id: 1,
  self_intro: '后端开发 · 目标 35K/月 · 上海 / 杭州',
  primary_role: '后端开发',
  backup_roles: ['平台工程'],
  industries: ['SaaS', '电商'],
  company_types: ['互联网大厂'],
  cities: ['上海', '杭州'],
  current_salary_base: 2800000,
  current_salary_months: 12,
  expect_floor: 3000000,
  expect_target: 3500000,
  strengths: [{ tag: '高并发', evidence: '主导过 QPS 3w 的订单服务' }],
  gaps: [{ gap: '系统设计', action: '每周精读 2 篇架构案例' }],
  updated_at: '2026-11-01 10:00:00',
}

export const profileApi = {
  /** GET /profile */
  async get(): Promise<Profile> {
    if (USE_MOCK) return MOCK_PROFILE
    return http.get<Profile>('/profile')
  },

  /** PUT /profile */
  async update(data: Partial<Profile>): Promise<Profile> {
    if (USE_MOCK) return { ...MOCK_PROFILE, ...data }
    return http.put<Profile>('/profile', data)
  },

  /** GET /resumes（含命中率） */
  async listResumes(): Promise<Resume[]> {
    if (USE_MOCK) return []
    return http.get<Resume[]>('/resumes')
  },

  /** POST /resumes */
  async createResume(data: { name: string; target_role: string }): Promise<Resume> {
    if (USE_MOCK) {
      return {
        id: 1,
        user_id: 1,
        name: data.name,
        target_role: data.target_role,
        is_primary: false,
        created_at: new Date().toISOString(),
      }
    }
    return http.post<Resume>('/resumes', data)
  },

  /** PUT /resumes/:id */
  async updateResume(id: number, data: Partial<Resume>): Promise<Resume> {
    if (USE_MOCK) return data as Resume
    return http.put<Resume>(`/resumes/${id}`, data)
  },

  /** DELETE /resumes/:id */
  async deleteResume(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.del<void>(`/resumes/${id}`)
  },

  /** PUT /resumes/:id/primary */
  async setPrimaryResume(id: number): Promise<void> {
    if (USE_MOCK) return
    await http.put<void>(`/resumes/${id}/primary`)
  },
}
