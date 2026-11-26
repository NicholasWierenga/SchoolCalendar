import { CalendarDays, List, LogOut, MapPin, Plus, UsersRound } from 'lucide-react'
import SchoolBrand from './SchoolBrand'

const calendarLink = ['calendar', 'Calendar', 'nav-calendar', CalendarDays]
const teacherLinks = [
  calendarLink,
  ['my-events', 'My Events', 'nav-my-events', List],
]
const approverLinks = [
  calendarLink,
  ['events', 'Events', 'nav-event-management', List],
  ['users', 'Users', 'nav-user-management', UsersRound],
  ['locations', 'Locations', 'nav-location-management', MapPin],
]

export default function AppHeader({ user, page, onNavigate, onNew, onSignOut }) {
  const approver = user.role === 'approver'
  const links = approver ? approverLinks : teacherLinks
  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <SchoolBrand />
          <div className="account-area" data-testid="signed-in">
            <span className="account-avatar" aria-hidden="true">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <div className="account-name">
              {user.firstName} {user.lastName}
              <small>{approver ? 'Approver' : 'Standard user'}</small>
            </div>
            <button
              type="button"
              className="signout"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <nav className="school-nav" aria-label="School calendar navigation">
        <div className="nav-inner">
          <div className="nav-links">
            {links.map(([id, label, testId, Icon]) => (
              <button
                key={id}
                type="button"
                aria-current={page === id ? 'page' : undefined}
                onClick={() => onNavigate(id)}
                data-testid={testId}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="primary new-event" onClick={onNew} data-testid="nav-new-event">
            <Plus size={17} />
            {approver ? 'New event' : 'Propose event'}
          </button>
        </div>
      </nav>
    </>
  )
}
