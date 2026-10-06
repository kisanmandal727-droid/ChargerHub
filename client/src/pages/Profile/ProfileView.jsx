import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BatteryCharging, Bookmark, Calendar, Camera, Car, Check, CheckCircle2, ChevronRight,
  Clock3, FileText, Headphones, IndianRupee, Laptop, LogOut, Package, Pencil,
  Route, Shield, Smartphone, Tag, Trash2, Wallet, Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useWallet } from '../../context/WalletContext.jsx';
import { useVehicle } from '../../context/VehicleContext.jsx';
import { api } from '../../api/client.js';
import { legalContent } from '../Auth/LegalPage.jsx';
import HelpAssistantModal from '../../components/HelpAssistantModal.jsx';

const activeStatuses = new Set(['initiating', 'charging', 'paused']);

function getDeviceLabel() {
  if (typeof navigator === 'undefined') return 'Current browser session';
  const agent = navigator.userAgent || '';
  const platform = /Android/i.test(agent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(agent) ? 'iOS'
      : /Windows/i.test(agent) ? 'Windows'
        : /Macintosh|Mac OS/i.test(agent) ? 'macOS'
          : /Linux/i.test(agent) ? 'Linux' : 'this device';
  const browser = /Edg\//i.test(agent) ? 'Microsoft Edge'
    : /Firefox\//i.test(agent) ? 'Firefox'
      : /Chrome\//i.test(agent) ? 'Chrome'
        : /Safari\//i.test(agent) ? 'Safari' : 'Web browser';
  return `${browser} on ${platform}`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function formatMoney(value) {
  const amount = Number(value);
  return `₹${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function Row({ icon: Icon, title, detail, onClick, destructive = false }) {
  return (
    <button className="profile-option" type="button" onClick={onClick}>
      <span className={`profile-option-icon${destructive ? ' is-danger' : ''}`}><Icon size={19} /></span>
      <span className="profile-option-copy">
        <span className={`profile-option-title${destructive ? ' is-danger' : ''}`}>{title}</span>
        {detail && <span className="profile-option-detail">{detail}</span>}
      </span>
      <ChevronRight size={18} className="profile-option-chevron" />
    </button>
  );
}

function SessionCard({ session }) {
  const status = String(session.status || 'completed').toLowerCase();
  const ongoing = activeStatuses.has(status);
  const station = session.station_name || 'Charging station';
  const charger = session.charger_name || session.connector_name || 'Charger';
  const energy = Number(session.energy_delivered_kwh || 0);
  return (
    <article className="profile-data-card">
      <div className="profile-data-card-heading">
        <div>
          <h3>{station}</h3>
          <p>{charger}{session.connector_type ? ` · ${session.connector_type}` : ''}</p>
        </div>
        <span className={`profile-status ${ongoing ? 'is-active' : ''}`}>{ongoing ? status : status === 'stopped' ? 'Stopped' : 'Completed'}</span>
      </div>
      <div className="profile-data-grid">
        <span><Clock3 size={15} />{formatDate(session.started_at)}</span>
        <span><BatteryCharging size={15} />{energy.toFixed(2)} kWh</span>
        <span><IndianRupee size={15} />{formatMoney(session.total_cost ?? session.cost)}</span>
        {session.vehicle_model && <span><Car size={15} />{session.vehicle_model}</span>}
      </div>
    </article>
  );
}

export default function ProfileView({ onBack, onOpenVehicles, onOpenReservations, onOpenOrders, onOpenSavedStations, onOpenTrips }) {
  const { user, logout, updateAccountProfile } = useAuth();
  const { wallet, setShowTopupModal } = useWallet();
  const { vehicles, primaryVehicle, loading: vehiclesLoading } = useVehicle();
  const [page, setPage] = useState('home');
  const [legalType, setLegalType] = useState('privacy');
  const [showHelpAssistant, setShowHelpAssistant] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [deviceLabel] = useState(getDeviceLabel);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profilePhoneDraft, setProfilePhoneDraft] = useState("");
  const [profileAvatarDraft, setProfileAvatarDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const photoInputRef = useRef(null);
  useEffect(() => {
    if (page !== 'sessions') return undefined;
    let mounted = true;
    setSessionLoading(true);
    setSessionError('');
    Promise.allSettled([api.get('/charging/active'), api.get('/charging/history')])
      .then(([activeResult, historyResult]) => {
        if (!mounted) return;
        if (historyResult.status === 'fulfilled') {
          const history = Array.isArray(historyResult.value.history) ? historyResult.value.history : [];
          if (activeResult.status === 'fulfilled' && activeResult.value.activeSession) {
            const active = activeResult.value.activeSession;
            setSessions([active, ...history.filter((item) => String(item.id) !== String(active.id))]);
          } else {
            setSessions(history);
          }
        } else if (activeResult.status === 'fulfilled' && activeResult.value.activeSession) {
          setSessions([activeResult.value.activeSession]);
          setSessionError('Could not load completed sessions.');
        } else {
          setSessionError(historyResult.reason?.message || 'Charging sessions could not be loaded.');
        }
      })
      .catch((error) => {
        if (mounted) setSessionError(error.message || 'Charging sessions could not be loaded.');
      })
      .finally(() => {
        if (mounted) setSessionLoading(false);
      });
    return () => { mounted = false; };
  }, [page]);

  const userName = user?.name || user?.displayName || 'ChargerHub member';
  const userEmail = user?.email || '';
  const initials = user?.avatar_initials || userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CH';
  const balance = Number(wallet?.balance || 0);

  const openPage = (nextPage) => setPage(nextPage);
  const backToHome = () => setPage("home");
  const openProfileEditor = () => {
    setProfileNameDraft(user?.name || user?.displayName || "");
    setProfilePhoneDraft(user?.phone || "");
    setProfileAvatarDraft(user?.avatar_url || "");
    setProfileError("");
    setProfileNotice("");
    setPage("edit-profile");
  };

  const handlePhotoSelection = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Choose an image file for your profile photo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProfileError("Choose an image smaller than 8 MB.");
      return;
    }

    setPhotoProcessing(true);
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - side) / 2;
        const sourceY = (image.naturalHeight - side) / 2;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image. Try another photo.");
        context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 512, 512);
        let quality = 0.84;
        let imageData = canvas.toDataURL("image/jpeg", quality);
        while (imageData.length > 500000 && quality > 0.5) {
          quality -= 0.08;
          imageData = canvas.toDataURL("image/jpeg", quality);
        }
        if (imageData.length > 500000) throw new Error("This photo is too large after resizing. Try another one.");
        setProfileAvatarDraft(imageData);
        setProfileError("");
      } catch (error) {
        setProfileError(error.message || "Could not prepare this image.");
      } finally {
        setPhotoProcessing(false);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPhotoProcessing(false);
      setProfileError("This image could not be opened. Try another photo.");
    };
    image.src = objectUrl;
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    const cleanName = profileNameDraft.trim();
    const phoneDigits = profilePhoneDraft.replace(/\D/g, "");
    if (!cleanName || cleanName.length > 80) {
      setProfileError("Enter a name with 1 to 80 characters.");
      return;
    }
    if (profilePhoneDraft.trim() && phoneDigits.length < 10) {
      setProfileError("Enter a valid 10-digit phone number.");
      return;
    }

    setProfileSaving(true);
    setProfileError("");
    try {
      const profileChanges = {
        name: cleanName,
        phone: profilePhoneDraft.trim() ? `+91${phoneDigits.slice(-10)}` : "",
      };
      if (profileAvatarDraft !== (user?.avatar_url || "")) {
        profileChanges.avatar_url = profileAvatarDraft || null;
      }
      await updateAccountProfile(profileChanges);
      setProfileNotice("Your ChargerHub profile has been updated.");
      setPage("home");
    } catch (error) {
      setProfileError(error.message || "Your profile could not be updated. Please try again.");
    } finally {
      setProfileSaving(false);
    }
  };

  const pageTitle = {
    sessions: 'Charging sessions',
    offers: 'Offers',
    vehicles: 'Your vehicles',
    devices: 'Devices logged in',
    privacy: 'Account privacy and policy',
    legal: legalContent[legalType]?.title || 'Account privacy and policy',
    'edit-profile': 'Edit profile',
  }[page];

  const pageHeader = (title = pageTitle) => (
    <div className="profile-subpage-header">
      <button className="profile-back-button" type="button" onClick={page === 'legal' ? () => setPage('privacy') : backToHome} aria-label="Back to profile">
        <ArrowLeft size={20} />
      </button>
      <h1>{title}</h1>
      <span className="profile-header-spacer" />
    </div>
  );

  const pageFrame = (title, children) => (
    <section className="profile-subpage">
      {pageHeader(title)}
      <div className="profile-subpage-content">{children}</div>
    </section>
  );

  if (page !== 'home') {
    if (page === "edit-profile") {
      return (
        <div className="profile-page">
          {pageFrame("Edit profile", <form className="profile-edit-form" onSubmit={handleProfileSave}>
            <div className="profile-photo-editor">
              <div className="profile-avatar profile-avatar-large">
                {profileAvatarDraft ? <img src={profileAvatarDraft} alt="Profile photo preview" /> : initials}
              </div>
              <div className="profile-photo-actions">
                <input ref={photoInputRef} className="profile-file-input" type="file" accept="image/*" onChange={handlePhotoSelection} />
                <button className="profile-secondary-button" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoProcessing}><Camera size={17} /> {photoProcessing ? "Preparing photo…" : "Choose photo"}</button>
                {profileAvatarDraft && <button className="profile-remove-photo" type="button" onClick={() => setProfileAvatarDraft("")}><Trash2 size={16} /> Remove photo</button>}
                <p>Your photo is centered and cropped to fit your profile.</p>
              </div>
            </div>
            <label className="profile-field"><span>Name</span><input type="text" autoComplete="name" maxLength={80} value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} placeholder="Your name" required /></label>
            <label className="profile-field"><span>Phone number</span><input type="tel" autoComplete="tel" value={profilePhoneDraft} onChange={(event) => setProfilePhoneDraft(event.target.value)} placeholder="+91 98765 43210" /><small>Use a 10-digit mobile number.</small></label>
            {profileError && <p className="profile-form-message is-error" role="alert">{profileError}</p>}
            <div className="profile-form-actions"><button className="profile-secondary-button" type="button" onClick={backToHome} disabled={profileSaving}>Cancel</button><button className="profile-save-button" type="submit" disabled={profileSaving || photoProcessing}>{photoProcessing ? "Preparing photo…" : profileSaving ? "Saving…" : "Save changes"}</button></div>
          </form>)}
        </div>
      );
    }
    if (page === 'sessions') {
      const ongoing = sessions.filter((session) => activeStatuses.has(String(session.status || '').toLowerCase()));
      const completed = sessions.filter((session) => !activeStatuses.has(String(session.status || '').toLowerCase()));
      return (
        <div className="profile-page">
          {pageFrame('Charging sessions', <>
            {sessionLoading && <p className="profile-message">Loading your sessions…</p>}
            {sessionError && <p className="profile-message is-error">{sessionError}</p>}
            {!sessionLoading && !sessionError && sessions.length === 0 && <div className="profile-empty"><Zap size={24} /><h2>No charging sessions yet</h2><p>Your ongoing and completed sessions will appear here.</p></div>}
            {ongoing.length > 0 && <div className="profile-session-group"><h2>Ongoing</h2>{ongoing.map((session) => <SessionCard key={session.id} session={session} />)}</div>}
            {completed.length > 0 && <div className="profile-session-group"><h2>Completed</h2>{completed.map((session) => <SessionCard key={session.id} session={session} />)}</div>}
          </>)}
        </div>
      );
    }

    if (page === 'offers') {
      return <div className="profile-page">{pageFrame('Offers', <div className="profile-empty"><Tag size={25} /><h2>No offers available right now</h2><p>New ChargerHub offers will show up here. Coming soon.</p></div>)}</div>;
    }

    if (page === 'vehicles') {
      return (
        <div className="profile-page">
          {pageFrame('Your vehicles', <>
            {vehiclesLoading && <p className="profile-message">Loading your vehicles…</p>}
            {!vehiclesLoading && vehicles.length === 0 && <div className="profile-empty"><Car size={25} /><h2>No vehicle registered</h2><p>Add a vehicle to see it here and use it for charging sessions.</p></div>}
            {vehicles.map((vehicle) => (
              <article className="profile-data-card" key={vehicle.id}>
                <div className="profile-data-card-heading">
                  <div><h3>{vehicle.model || 'Electric vehicle'}</h3><p>{vehicle.make || vehicle.brand || 'Registered vehicle'}</p></div>
                  {vehicle.is_primary && <span className="profile-status is-active"><Check size={13} /> Primary</span>}
                </div>
                <div className="profile-data-grid">
                  {vehicle.registration_no && <span><Car size={15} />{vehicle.registration_no}</span>}
                  {vehicle.current_battery_pct != null && <span><BatteryCharging size={15} />{Number(vehicle.current_battery_pct)}% battery</span>}
                  {vehicle.battery_capacity_kwh != null && <span><Zap size={15} />{vehicle.battery_capacity_kwh} kWh battery</span>}
                  {vehicle.range_km != null && <span><Route size={15} />{vehicle.range_km} km range</span>}
                </div>
              </article>
            ))}
            <button className="profile-primary-button" type="button" onClick={onOpenVehicles}>{primaryVehicle ? 'Add or change vehicle' : 'Add a vehicle'}</button>
          </>)}
        </div>
      );
    }

    if (page === 'devices') {
      return (
        <div className="profile-page">
          {pageFrame('Devices logged in', <>
            <article className="profile-data-card profile-device-card">
              <span className="profile-device-icon"><Smartphone size={22} /></span>
              <div><span className="profile-current-label">CURRENT DEVICE</span><h3>{deviceLabel}</h3><p>{userEmail || 'Signed in to your ChargerHub account'}</p><span className="profile-status is-active"><span className="profile-status-dot" /> Signed in now</span></div>
            </article>
            <p className="profile-note">This shows the browser session you are using now. ChargerHub does not currently keep a list of other signed-in devices.</p>
          </>)}
        </div>
      );
    }

    if (page === 'privacy') {
      return (
        <div className="profile-page">
          {pageFrame('Account privacy and policy', <>
            <p className="profile-page-intro">Review how ChargerHub uses account information and the terms for using the app.</p>
            <button className="profile-legal-link" type="button" onClick={() => { setLegalType('privacy'); setPage('legal'); }}><Shield size={20} /><span><strong>Privacy Policy</strong><small>How account and app information is used</small></span><ChevronRight size={18} /></button>
            <button className="profile-legal-link" type="button" onClick={() => { setLegalType('terms'); setPage('legal'); }}><FileText size={20} /><span><strong>Terms and Conditions</strong><small>Rules for using ChargerHub</small></span><ChevronRight size={18} /></button>
          </>)}
        </div>
      );
    }

    if (page === 'legal') {
      const policy = legalContent[legalType] || legalContent.privacy;
      return (
        <div className="profile-page">
          {pageFrame(policy.title, <>
            <p className="profile-page-intro">{policy.updated}</p>
            <div className="profile-legal-content">{policy.sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}</div>
            <div className="profile-legal-switcher">
              <button type="button" onClick={() => setLegalType('terms')}>Terms and Conditions</button>
              <button type="button" onClick={() => setLegalType('privacy')}>Privacy Policy</button>
            </div>
          </>)}
        </div>
      );
    }
  }

  return (
    <div className="profile-page">
      <main className="profile-home-scroll">
        <div className="profile-home-content">
          <div className="profile-subpage-header profile-home-header">
            <button className="profile-back-button" type="button" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
            <h1>Profile</h1>
            <span className="profile-header-spacer" />
          </div>

          {profileNotice && <p className="profile-form-message is-success" role="status">{profileNotice}</p>}
          <section className="profile-identity-card">
            <div className="profile-avatar">{user?.avatar_url ? <img src={user.avatar_url} alt="Your profile" /> : initials}</div>
            <div className="profile-identity-copy">
              <div className="profile-name-line">
                <h2>{userName}</h2>
                {user?.role === 'admin' && <CheckCircle2 size={18} fill="#1688F8" color="#FFFFFF" aria-label="Verified admin" title="Verified admin" />}
              </div>
              <p>{userEmail || 'ChargerHub account'}</p>
              <p>{user?.phone || 'Phone number not added'}</p>
            </div>
            <button className="profile-edit-button" type="button" onClick={openProfileEditor} aria-label="Edit your profile" title="Edit profile"><Pencil size={18} /></button>
          </section>

          <section className="profile-brand-card">
            <span className="profile-brand-icon"><Zap size={21} /></span>
            <div><strong>Find your charge. Keep moving.</strong><span>Explore charging, routes, and journeys with ChargerHub.</span></div>
          </section>

          <section className="profile-shortcuts" aria-label="Profile shortcuts">
            <button type="button" onClick={() => openPage('sessions')}><FileText size={22} /><span>Sessions</span></button>
            <button type="button" onClick={() => openPage('offers')}><Tag size={22} /><span>Offers</span></button>
            <button type="button" onClick={() => setShowHelpAssistant(true)}><Headphones size={22} /><span>Help</span></button>
          </section>

          <section className="profile-wallet-card">
            <span className="profile-wallet-icon"><Wallet size={21} /></span>
            <div className="profile-wallet-copy"><strong>{formatMoney(balance)}</strong><span>Wallet balance</span></div>
            <button type="button" onClick={() => setShowTopupModal(true)}>Add credits</button>
          </section>

          <section className="profile-options" aria-label="Profile options">
            <Row icon={Car} title="Manage vehicles" detail={primaryVehicle?.model || 'View registered vehicles'} onClick={() => openPage('vehicles')} />
            <Row icon={Calendar} title="Reservations" onClick={onOpenReservations} />
            <Row icon={Bookmark} title="Saved stations" onClick={onOpenSavedStations} />
            <Row icon={Package} title="Orders" onClick={onOpenOrders} />
            <Row icon={Route} title="Saved trips" onClick={onOpenTrips} />
            <Row icon={Shield} title="Account privacy and policy" onClick={() => openPage('privacy')} />
            <Row icon={Laptop} title="Devices logged in" detail={deviceLabel} onClick={() => openPage('devices')} />
            <Row icon={LogOut} title="Log out" destructive onClick={logout} />
          </section>

          <footer className="profile-footer"><strong>ChargerHub</strong><span>Built for every journey.</span></footer>
        </div>
      </main>
      {showHelpAssistant && <HelpAssistantModal onClose={() => setShowHelpAssistant(false)} />}
    </div>
  );
}






