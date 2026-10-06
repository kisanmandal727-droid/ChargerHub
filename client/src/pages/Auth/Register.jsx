import React from 'react';
import Login from './Login.jsx';

export default function Register({ onBackToLogin, onChangeView }) {
  return (
    <Login
      view="signup"
      onChangeView={(view) => {
        if (view === 'login') onBackToLogin?.();
        onChangeView?.(view);
      }}
    />
  );
}
