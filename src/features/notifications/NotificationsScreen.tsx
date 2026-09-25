"use client";
import { NotificationList } from "./NotificationList";

/** /notifications — misma lista que el diálogo del prototipo, como página (enlace directo). */
export function NotificationsScreen() {
  return (
    <div className="groups-page">
      <div className="groups-page-head">
        <div>
          <p className="eyebrow">Cuenta</p>
          <h1>Notificaciones</h1>
        </div>
      </div>
      <div className="panel">
        <NotificationList />
      </div>
    </div>
  );
}
