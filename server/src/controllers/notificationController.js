import db from '../db/firestore.js';

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await db.where('notifications', 'user_id', Number(userId));
    notifications.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ notifications: notifications.slice(0, 30) });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (id === 'all') {
      const notifications = await db.where('notifications', 'user_id', Number(userId));
      await Promise.all(notifications.map((item) => db.update('notifications', item.id, { is_read: true })));
    } else {
      const notification = await db.get('notifications', id);
      if (notification && Number(notification.user_id) === Number(userId)) await db.update('notifications', id, { is_read: true });
    }

    return res.json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error('Error marking notifications:', err);
    return res.status(500).json({ error: 'Failed to update notification status' });
  }
};
