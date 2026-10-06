import { Router } from 'express';
import * as authCtrl from '../controllers/authFirestoreController.js';
import * as vehicleCtrl from '../controllers/vehicleController.js';
import * as stationCtrl from '../controllers/stationController.js';
import * as chargingCtrl from '../controllers/chargingFirestoreController.js';
import * as walletCtrl from '../controllers/walletFirestoreController.js';
import * as resCtrl from '../controllers/reservationFirestoreController.js';
import * as tripCtrl from '../controllers/tripController.js';
import * as shopCtrl from '../controllers/shopFirestoreController.js';
import * as buzzCtrl from '../controllers/buzzController.js';
import * as notifCtrl from '../controllers/notificationController.js';
import * as adminCtrl from '../controllers/adminFirestoreController.js';
import * as supportCtrl from '../controllers/supportController.js';
import { authenticateToken, requireAdmin, authenticateSimulator } from '../middleware/auth.js';

const router = Router();

// ================= AUTH =================
router.post('/auth/firebase/session', authCtrl.firebaseSession);
router.get('/auth/me', authenticateToken, authCtrl.getMe);
router.put('/auth/profile', authenticateToken, authCtrl.updateProfile);

// ================= VEHICLES =================
router.get('/vehicles/catalog', vehicleCtrl.getCatalog);
router.get('/vehicles', authenticateToken, vehicleCtrl.getMyVehicles);
router.post('/vehicles', authenticateToken, vehicleCtrl.addVehicle);
router.put('/vehicles/:id', authenticateToken, vehicleCtrl.updateVehicle);
router.delete('/vehicles/:id', authenticateToken, vehicleCtrl.deleteVehicle);
router.put('/vehicles/:id/primary', authenticateToken, vehicleCtrl.setPrimaryVehicle);

// ================= STATIONS =================
router.get('/stations', (req, res, next) => {
  // Optional auth header decoding for saved station state
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return authenticateToken(req, res, next);
  }
  next();
}, stationCtrl.getStations);
router.get('/stations/saved', authenticateToken, stationCtrl.getSavedStations);
router.get('/stations/:id', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) return authenticateToken(req, res, next);
  next();
}, stationCtrl.getStationById);
router.get('/stations/:id/amenities', stationCtrl.getNearbyAmenities);
router.get('/stations/:id/reviews', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) return authenticateToken(req, res, next);
  next();
}, stationCtrl.getStationReviews);
router.post('/stations/:id/reviews', authenticateToken, stationCtrl.saveStationReview);
router.delete('/stations/:id/reviews', authenticateToken, stationCtrl.deleteStationReview);
router.post('/stations/:id/save', authenticateToken, stationCtrl.toggleSaveStation);

// ================= CHARGING =================
router.post('/charging/calculate', authenticateToken, chargingCtrl.calculateCharging);
router.post('/charging/start', authenticateToken, chargingCtrl.startCharging);
router.get('/charging/active', authenticateToken, chargingCtrl.getActiveSession);
router.post('/charging/:id/telemetry', authenticateSimulator, chargingCtrl.updateTelemetry);
router.post('/charging/:id/stop', authenticateToken, chargingCtrl.stopCharging);
router.get('/charging/history', authenticateToken, chargingCtrl.getHistory);

// ================= WALLET =================
router.get('/wallet', authenticateToken, walletCtrl.getWallet);
router.post('/wallet/razorpay/order', authenticateToken, walletCtrl.createRazorpayOrder);
router.post('/wallet/razorpay/verify', authenticateToken, walletCtrl.verifyRazorpayPayment);
router.get('/wallet/transactions', authenticateToken, walletCtrl.getTransactions);

// ================= RESERVATIONS =================
router.post('/reservations', authenticateToken, resCtrl.createReservation);
router.get('/reservations', authenticateToken, resCtrl.getMyReservations);
router.delete('/reservations/:id', authenticateToken, resCtrl.cancelReservation);
router.delete('/reservations/:id/history', authenticateToken, resCtrl.deleteReservationHistory);

// ================= TRIPS =================
router.post('/trips/plan', authenticateToken, tripCtrl.planTrip);
router.post('/trips/save', authenticateToken, tripCtrl.saveTrip);
router.get('/trips/saved', authenticateToken, tripCtrl.getSavedTrips);
router.delete('/trips/saved/:id', authenticateToken, tripCtrl.deleteSavedTrip);

// ================= SHOP =================
router.get('/shop/products', shopCtrl.getProducts);
router.post('/shop/orders', authenticateToken, shopCtrl.createOrder);
router.get('/shop/orders', authenticateToken, shopCtrl.getOrders);

// ================= BUZZ =================
router.get('/buzz/posts', authenticateToken, buzzCtrl.getBuzzPosts);
router.get('/buzz/saved', authenticateToken, buzzCtrl.getSavedBuzzPosts);
router.get('/buzz/posts/:id/image', buzzCtrl.getPostImage);
router.post('/buzz/posts', authenticateToken, buzzCtrl.createBuzzPost);
router.delete('/buzz/posts/:id', authenticateToken, buzzCtrl.deleteBuzzPost);
router.post('/buzz/posts/:id/like', authenticateToken, buzzCtrl.likePost);
router.post('/buzz/posts/:id/save', authenticateToken, buzzCtrl.toggleSavedPost);
router.get('/buzz/posts/:id/comments', authenticateToken, buzzCtrl.getPostComments);
router.post('/buzz/posts/:id/comments', authenticateToken, buzzCtrl.addPostComment);
router.delete('/buzz/posts/:id/comments/:commentId', authenticateToken, buzzCtrl.deletePostComment);

// ================= NOTIFICATIONS =================
router.get('/notifications', authenticateToken, notifCtrl.getNotifications);
router.put('/notifications/:id/read', authenticateToken, notifCtrl.markAsRead);

// ================= SUPPORT =================
router.post('/support/tickets', authenticateToken, supportCtrl.createTicket);
router.get('/support/chats', authenticateToken, supportCtrl.listUserChats);
router.post('/support/chats', authenticateToken, supportCtrl.createChat);
router.get('/support/chats/:id', authenticateToken, supportCtrl.getUserChat);
router.post('/support/chats/:id/messages', authenticateToken, supportCtrl.addUserMessages);
router.post('/support/chats/:id/escalate', authenticateToken, supportCtrl.escalateChat);
router.delete('/support/chats/:id', authenticateToken, supportCtrl.deleteUserChat);

// ================= ADMIN =================
router.get('/admin/metrics', authenticateToken, requireAdmin, adminCtrl.getMetrics);
router.get('/admin/stations', authenticateToken, requireAdmin, adminCtrl.getAllStationsWithConnectors);
router.post('/admin/stations', authenticateToken, requireAdmin, adminCtrl.createStation);
router.put('/admin/stations/:id', authenticateToken, requireAdmin, adminCtrl.updateStation);
router.delete('/admin/stations/:id', authenticateToken, requireAdmin, adminCtrl.removeStation);
router.put('/admin/connectors/:id/status', authenticateToken, requireAdmin, adminCtrl.updateConnectorStatus);
router.get('/admin/sessions', authenticateToken, requireAdmin, adminCtrl.getAllSessions);
router.get('/admin/users', authenticateToken, requireAdmin, adminCtrl.getAllUsers);
router.delete('/admin/users/:id', authenticateToken, requireAdmin, adminCtrl.deleteUser);
router.get('/admin/support/tickets', authenticateToken, requireAdmin, supportCtrl.getTickets);
router.put('/admin/support/tickets/:id/status', authenticateToken, requireAdmin, supportCtrl.updateTicketStatus);
router.post('/admin/support/tickets/:id/messages', authenticateToken, requireAdmin, supportCtrl.addAdminMessage);
router.delete('/admin/support/tickets/:id', authenticateToken, requireAdmin, supportCtrl.deleteAdminChat);

export default router;

