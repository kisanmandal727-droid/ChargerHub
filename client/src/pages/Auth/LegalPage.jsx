import React from 'react';
import { ArrowLeft, Zap } from 'lucide-react';

export const legalContent = {
  terms: {
    title: 'Terms and Conditions',
    updated: 'These terms apply when you use ChargerHub.',
    sections: [
      ['Using ChargerHub', 'ChargerHub helps you find charging stations, plan trips, manage your account and wallet, and view charging activity. You must provide accurate account details and keep your sign-in credentials private.'],
      ['Charging stations', 'Station locations, connector details, prices, and availability can change. Check the information shown at the station before connecting your vehicle, and follow the vehicle and charger manufacturer’s instructions. ChargerHub does not operate every station shown in the app.'],
      ['Wallet and payments', 'Payments are processed through the payment provider shown at checkout. Wallet credits are added only after the payment is verified. Keep your payment confirmation for reference and contact support through the app if a verified payment is missing.'],
      ['Safe and lawful use', 'Use the app and charging equipment safely and lawfully. Do not interfere with chargers, attempt unauthorized access, or misuse another person’s account.'],
      ['Availability and changes', 'Some app features depend on internet access, Firebase, map services, and participating stations. Features may be updated or temporarily unavailable. We may update these terms as the service changes.'],
      ['Help', 'For questions about your account or a charging session, use the Help option in the app to contact ChargerHub support.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'This policy explains the information ChargerHub uses to provide the app.',
    sections: [
      ['Information you provide', 'When you create an account, ChargerHub uses your name, email address, and phone number. Your profile may also include vehicles and other details you choose to add.'],
      ['App and charging activity', 'The service stores information needed to provide its features, such as saved stations and trips, reservations, charging sessions, wallet activity, support conversations, and account settings.'],
      ['Location', 'If you allow location access, ChargerHub may use your device location to show nearby stations and help plan routes. You can manage location permission in your browser or device settings.'],
      ['Sign-in and payments', 'Firebase Authentication verifies sign-ins. Google sign-in may provide your Google account name and email. Payments are handled by the payment provider shown at checkout; ChargerHub does not ask you to enter card details into the app itself.'],
      ['How information is used', 'Information is used to operate your account, show app features, process charging and wallet activity, protect the service, and respond to support requests. ChargerHub does not sell your personal information.'],
      ['Storage and security', 'Account and service records are stored for ChargerHub to provide the app. The service uses access controls and reasonable safeguards, but no online service can guarantee absolute security.'],
      ['Your choices', 'You can control browser or device location permissions and stop using the service at any time. For help with account information or deletion, contact ChargerHub through the in-app Help option. Some transaction or security records may need to be retained for service or legal reasons.'],
      ['Policy updates', 'This policy may be updated when app features or data practices change. The current version is available on this page.'],
    ],
  },
};

export default function LegalPage({ type = 'terms', onBack, onChangeView }) {
  const policy = legalContent[type] || legalContent.terms;
  return (
    <main className="auth-screen auth-legal-page">
      <button className="auth-back-button" type="button" onClick={onBack}>
        <ArrowLeft size={19} /> Back
      </button>
      <div className="auth-brand auth-legal-brand">
        <div className="auth-brand-icon"><Zap size={24} strokeWidth={2.5} /></div>
        <div>
          <h1>ChargerHub</h1>
          <span>Charge On The Go</span>
        </div>
      </div>
      <h2>{policy.title}</h2>
      <p className="auth-intro">{policy.updated}</p>
      <div className="auth-legal-content">
        {policy.sections.map(([heading, text]) => (
          <section key={heading}>
            <h3>{heading}</h3>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <div className="auth-legal-links">
        <button type="button" onClick={() => onChangeView?.('terms')}>Terms and Conditions</button>
        <button type="button" onClick={() => onChangeView?.('privacy')}>Privacy Policy</button>
      </div>
      <button className="btn-primary auth-submit" type="button" onClick={onBack}>Back to sign in</button>
    </main>
  );
}



