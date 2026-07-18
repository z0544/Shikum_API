import { Icon } from './icons';

/** מצב שגיאה אחיד עם אפשרות ניסיון חוזר — במקום כשל שקט (פאנל ריק). */
export function ErrorState({
  message = 'אירעה שגיאה בטעינת הנתונים',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <Icon name="warning" />
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          <Icon name="refresh" /> נסה שוב
        </button>
      )}
    </div>
  );
}
