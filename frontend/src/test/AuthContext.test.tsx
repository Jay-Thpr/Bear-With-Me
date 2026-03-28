import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import * as authApi from '../api/auth'

function AuthProbe() {
  const { user, googleIntegration, loading } = useAuth()
  if (loading) {
    return <p>loading</p>
  }
  return (
    <div>
      <span>{user?.display_name ?? 'signed-out'}</span>
      <span>{googleIntegration?.connected ? 'google-connected' : 'google-disconnected'}</span>
    </div>
  )
}

describe('AuthProvider', () => {
  it('hydrates user and google integration from /api/auth/me', async () => {
    vi.spyOn(authApi, 'fetchAuthMe').mockResolvedValue({
      authenticated: true,
      user: {
        id: 'user-1',
        email: 'learner@example.com',
        display_name: 'Learner',
        picture: null,
      },
      googleIntegration: {
        connected: true,
        provider: 'google',
        hasRefreshToken: true,
        grantedScopes: ['scope-a'],
        photosAppendOnlyGranted: true,
        photosAppReadGranted: false,
        driveFileGranted: false,
        calendarEventsGranted: false,
        documentsGranted: false,
      },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Learner')).toBeInTheDocument()
      expect(screen.getByText('google-connected')).toBeInTheDocument()
    })
  })
})
