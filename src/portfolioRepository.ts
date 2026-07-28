import { supabase } from './supabase'

export type PortfolioSnapshot<T> = {
  state: T
  schemaVersion: number
  revision: number
  updatedAt: string
}

export class PortfolioRepositoryError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'PortfolioRepositoryError'
    this.code = code
  }
}

const client = () => {
  if (!supabase) throw new PortfolioRepositoryError('supabase_not_configured')
  return supabase
}

export async function loadPortfolioSnapshot<T>(): Promise<PortfolioSnapshot<T> | null> {
  const { data, error } = await client()
    .from('portfolio_snapshots')
    .select('state, schema_version, revision, updated_at')
    .limit(1)
    .maybeSingle()

  if (error) throw new PortfolioRepositoryError(error.message, error.code)
  if (!data) return null

  return {
    state: data.state as T,
    schemaVersion: data.schema_version,
    revision: Number(data.revision),
    updatedAt: data.updated_at,
  }
}

export async function savePortfolioSnapshot<T>(
  userId: string,
  state: T,
  expectedRevision: number,
): Promise<{ revision: number; updatedAt: string }> {
  const { data, error } = await client()
    .rpc('save_portfolio_snapshot', {
      p_user_id: userId,
      p_state: state,
      p_schema_version: 1,
      p_expected_revision: expectedRevision,
    })
    .single()

  if (error) throw new PortfolioRepositoryError(error.message, error.code)

  const saved = data as { new_revision: number | string; saved_at: string }
  return {
    revision: Number(saved.new_revision),
    updatedAt: saved.saved_at,
  }
}
