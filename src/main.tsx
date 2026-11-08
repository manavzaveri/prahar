import React from 'react';
import {createRoot} from 'react-dom/client';
import Lab from './App';
import './lab.css';
import './readability.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Lab/></React.StrictMode>);
