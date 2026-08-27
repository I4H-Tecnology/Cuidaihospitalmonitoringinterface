import React from 'react';
import { Camera, Activity, RefreshCw, Settings, Eye, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface CameraFeed {
  id: string;
  name: string;
  location: string;
  patient: string;
  status: 'active' | 'processing' | 'offline';
  lastEvent: string;
  isLive: boolean;
}

const mockCameras: CameraFeed[] = [
  {
    id: 'CAM-UTI-101A',
    name: 'UTI - Leito 101-A',
    location: 'UTI → Leito 101-A',
    patient: 'Maria S.',
    status: 'active',
    lastEvent: 'Movimento normal • 2 min',
    isLive: true
  },
  {
    id: 'CAM-UTI-101B',
    name: 'UTI - Leito 101-B',
    location: 'UTI → Leito 101-B',
    patient: 'João P.',
    status: 'processing',
    lastEvent: 'Queda detectada • 5 min',
    isLive: false
  },
  {
    id: 'CAM-UTI-102A',
    name: 'UTI - Leito 102-A',
    location: 'UTI → Leito 102-A',
    patient: '',
    status: 'active',
    lastEvent: 'Leito vazio • 1h',
    isLive: true
  },
  {
    id: 'CAM-ENF-201A',
    name: 'Enfermaria - Leito 201-A',
    location: 'Enfermaria → Leito 201-A',
    patient: 'Carlos M.',
    status: 'active',
    lastEvent: 'Movimento normal • 3 min',
    isLive: true
  },
  {
    id: 'CAM-ENF-202B',
    name: 'Enfermaria - Leito 202-B',
    location: 'Enfermaria → Leito 202-B',
    patient: '',
    status: 'offline',
    lastEvent: 'Offline',
    isLive: false
  },
  {
    id: 'CAM-CLI-301A',
    name: 'Clínica - Leito 301-A',
    location: 'Clínica → Leito 301-A',
    patient: 'Roberto F.',
    status: 'active',
    lastEvent: 'Leito vazio • 30 min',
    isLive: true
  }
];

interface Detection {
  id: number;
  type: 'fall' | 'exit' | 'risk' | 'recognition';
  camera: string;
  patient: string;
  location: string;
  time: string;
  confidence: string;
  status: 'detected' | 'verified' | 'positive';
}

const mockDetections: Detection[] = [
  {
    id: 1,
    type: 'fall',
    camera: 'CAM-UTI-101B',
    patient: 'João P.',
    location: 'Leito 101-B',
    time: '5 min atrás',
    confidence: '98.5% confiança',
    status: 'detected'
  },
  {
    id: 2,
    type: 'exit',
    camera: 'CAM-ENF-202B',
    patient: 'Paula R.',
    location: 'Leito 202-B',
    time: '15 min atrás',
    confidence: '97.2% confiança',
    status: 'verified'
  },
  {
    id: 3,
    type: 'risk',
    camera: 'CAM-CLI-301A',
    patient: 'Roberto F.',
    location: 'Leito 301-A',
    time: '1h atrás',
    confidence: '72.1% confiança',
    status: 'positive'
  },
  {
    id: 4,
    type: 'recognition',
    camera: 'CAM-UTI-101A',
    patient: 'Maria S.',
    location: 'Leito 101-A',
    time: '2h atrás',
    confidence: '99.8% confiança',
    status: 'verified'
  }
];

export function MonitoringScreen() {
  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-gray-800 mb-1">Monitoramento Inteligente</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>OpenCV</span>
            <span>•</span>
            <span>MediaPipe</span>
            <span>•</span>
            <span>YOLOv8</span>
            <span>•</span>
            <span>Processamento em tempo real</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configurar IA
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl text-gray-800">4</p>
              <p className="text-xs text-gray-500">Câmeras Ativas</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-500">Processando</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Eye className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl text-gray-800">1</p>
              <p className="text-xs text-gray-500">Offline</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E8F4F8] rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#0A7EA4]" />
            </div>
            <div>
              <p className="text-2xl text-gray-800">1.247</p>
              <p className="text-xs text-gray-500">Eventos (24h)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl text-gray-800">97.4%</p>
              <p className="text-xs text-gray-500">Precisão</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Camera Feeds */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-800">Câmeras de Monitoramento</h2>
            <span className="text-sm text-gray-500">6 dispositivos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockCameras.map(camera => (
              <div
                key={camera.id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Camera Preview */}
                <div className="relative bg-gray-100 h-40 flex items-center justify-center">
                  <Camera className="w-12 h-12 text-gray-400" />
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    {camera.status === 'active' && (
                      <span className="px-2 py-1 bg-green-500 text-white text-xs rounded flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                        LIVE
                      </span>
                    )}
                    {camera.status === 'processing' && (
                      <span className="px-2 py-1 bg-yellow-500 text-white text-xs rounded flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        Processando
                      </span>
                    )}
                    {camera.status === 'offline' && (
                      <span className="px-2 py-1 bg-gray-500 text-white text-xs rounded">
                        Offline
                      </span>
                    )}
                  </div>

                  {/* Settings */}
                  <button className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-lg flex items-center justify-center hover:bg-white transition-colors">
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>

                {/* Camera Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="text-gray-800 mb-1">{camera.id}</h3>
                      <p className="text-sm text-gray-600 mb-1">{camera.location}</p>
                      {camera.patient && (
                        <p className="text-sm text-gray-500">👤 {camera.patient}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-3">
                    <Clock className="w-3 h-3" />
                    <span>{camera.lastEvent}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Detections */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-gray-800">Últimas Detecções</h2>
            <button className="text-sm text-[#0A7EA4] hover:underline">Ver todas</button>
          </div>

          <div className="space-y-3">
            {mockDetections.map(detection => {
              const typeConfig = {
                fall: { bg: 'bg-red-50', border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Queda' },
                exit: { bg: 'bg-yellow-50', border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle, label: 'Saída de Leito' },
                risk: { bg: 'bg-yellow-50', border: 'border-l-yellow-500', badge: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle, label: 'Comportamento de Risco' },
                recognition: { bg: 'bg-blue-50', border: 'border-l-[#0EA5E9]', badge: 'bg-blue-100 text-blue-700', icon: Eye, label: 'Reconhecimento Facial' }
              };
              
              const config = typeConfig[detection.type];
              const Icon = config.icon;
              
              const statusBadge = {
                detected: { bg: 'bg-red-500', text: 'Detectado' },
                verified: { bg: 'bg-green-500', text: 'Verificado' },
                positive: { bg: 'bg-yellow-500', text: 'Falso Positivo' }
              };
              
              const statusConfig = statusBadge[detection.status];

              return (
                <div
                  key={detection.id}
                  className={`${config.bg} ${config.border} border-l-4 rounded-lg p-4 shadow-sm`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Icon className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-1 rounded text-xs ${config.badge}`}>
                          {config.label}
                        </span>
                        <span className={`px-2 py-1 ${statusConfig.bg} text-white rounded text-xs`}>
                          {statusConfig.text}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-800 mb-1">📹 {detection.camera}</p>
                      <p className="text-sm text-gray-600 mb-1">👤 {detection.patient}</p>
                      <p className="text-sm text-gray-600 mb-1">🛏️ {detection.location}</p>
                      
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-gray-500">{detection.time}</span>
                        <span className="text-xs text-green-600">{detection.confidence}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
