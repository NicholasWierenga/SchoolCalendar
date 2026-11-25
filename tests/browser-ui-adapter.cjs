const { BrowserUi: BaseUi } = require(process.env.SCHOOLCALENDAR_EXERCISE_BROWSER_UI);

class BrowserUi extends BaseUi {
  hook(id, scope = this.page) {
    switch (id) {
      case 'nav-pending':
        return super.hook('nav-event-management', scope);
      case 'pending-list':
        return scope.getByRole('region', { name: 'Pending requests', exact: true });
      case 'pending-event':
        return super.hook('event-record', scope);
      case 'delete-pending':
        return super.hook('delete-record', scope);
      default:
        return super.hook(id, scope);
    }
  }
}

module.exports = { BrowserUi };
