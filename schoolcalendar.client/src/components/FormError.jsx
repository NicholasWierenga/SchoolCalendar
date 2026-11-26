export default function FormError({ children, className = 'form-error' }) {
  return children ? <p className={className} role="alert">{children}</p> : null
}
