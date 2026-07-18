import { useApp } from '../state/AppContext';
import { DetailPanel } from './DetailPanel';
import { Icon } from './icons';
import { Dialog } from './Dialog';

/**
 * חלון קופץ (modal) המציג וריאנט בודד מעל דף החיפוש — נפתח מקישור שיתוף
 * מסוג #/popup/<entityId>. סגירה חוזרת לדף החיפוש.
 */
export function VariantDialog({ entityId }: { entityId: string }) {
  const { closePopup, openVariant } = useApp();
  return (
    <Dialog onClose={closePopup} ariaLabel={`פרטי וריאנט ${entityId}`}>
      <div className="popup-head">
        <h3>
          וריאנט <span className="popup-id">{entityId}</span>
        </h3>
        <div className="popup-head-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              closePopup();
              openVariant(entityId);
            }}
            title="פתח בעמוד מלא"
          >
            <Icon name="external" /> עמוד מלא
          </button>
          <button className="chat-close" onClick={closePopup} aria-label="סגור">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="popup-body">
        <DetailPanel entityId={entityId} />
      </div>
    </Dialog>
  );
}
