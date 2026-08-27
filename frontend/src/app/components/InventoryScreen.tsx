import React, { useState } from 'react';
import { Package, AlertTriangle, Clock, TrendingUp, Download, Plus, Search, Filter, Lightbulb, BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = {
  primary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#8B5CF6'
};

interface InventoryItem {
  id: number;
  name: string;
  category: 'medicamento' | 'insumo' | 'material' | 'equipamento';
  quantity: number;
  unit: string;
  minQuantity: number;
  status: 'ok' | 'low' | 'critical' | 'expiring';
  lastMovement: string;
  expiryDate?: string;
  sector: string;
}

const mockInventory: InventoryItem[] = [
  { id: 1, name: 'Dipirona 500mg', category: 'medicamento', quantity: 850, unit: 'comp', minQuantity: 500, status: 'ok', lastMovement: 'há 2h', expiryDate: '06/2025', sector: 'Farmácia' },
  { id: 2, name: 'Luva Cirúrgica Estéril', category: 'material', quantity: 120, unit: 'caixa', minQuantity: 200, status: 'low', lastMovement: 'há 1h', sector: 'Centro Cirúrgico' },
  { id: 3, name: 'Soro Fisiológico 500ml', category: 'insumo', quantity: 45, unit: 'unid', minQuantity: 100, status: 'critical', lastMovement: 'há 30min', sector: 'UTI' },
  { id: 4, name: 'Cateter Venoso', category: 'material', quantity: 280, unit: 'unid', minQuantity: 150, status: 'ok', lastMovement: 'há 3h', sector: 'Enfermaria' },
  { id: 5, name: 'Paracetamol 750mg', category: 'medicamento', quantity: 420, unit: 'comp', minQuantity: 300, status: 'ok', lastMovement: 'há 1h', expiryDate: '03/2025', sector: 'Farmácia' },
  { id: 6, name: 'Gazes Esterilizadas', category: 'material', quantity: 65, unit: 'pct', minQuantity: 80, status: 'low', lastMovement: 'há 45min', sector: 'Enfermaria' },
  { id: 7, name: 'Antibiótico Ampicilina', category: 'medicamento', quantity: 28, unit: 'frasco', minQuantity: 50, status: 'critical', lastMovement: 'há 15min', expiryDate: '01/2025', sector: 'UTI' },
  { id: 8, name: 'Máscara N95', category: 'equipamento', quantity: 340, unit: 'unid', minQuantity: 200, status: 'ok', lastMovement: 'há 2h', sector: 'Geral' }
];

const consumptionBySectorData = [
  { sector: 'UTI', consumo: 450 },
  { sector: 'Centro Cirúrgico', consumo: 380 },
  { sector: 'Enfermaria', consumo: 290 },
  { sector: 'Pronto Socorro', consumo: 320 }
];

const consumptionTrendData = [
  { day: 'Seg', consumo: 120 },
  { day: 'Ter', consumo: 145 },
  { day: 'Qua', consumo: 135 },
  { day: 'Qui', consumo: 160 },
  { day: 'Sex', consumo: 150 },
  { day: 'Sáb', consumo: 95 },
  { day: 'Dom', consumo: 85 }
];

export function InventoryScreen() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [selectedStatus, setSelectedStatus] = useState('todos');

  const totalItems = mockInventory.length;
  const criticalItems = mockInventory.filter(i => i.status === 'critical').length;
  const lowItems = mockInventory.filter(i => i.status === 'low').length;
  const expiringItems = mockInventory.filter(i => i.expiryDate).length;
  const averageConsumption = 135;

  const filteredInventory = mockInventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'todas' || item.category === selectedCategory;
    const matchesStatus = selectedStatus === 'todos' || item.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categoryLabels = {
    medicamento: 'Medicamento',
    insumo: 'Insumo',
    material: 'Material',
    equipamento: 'Equipamento'
  };

  const statusConfig = {
    ok: { color: 'bg-green-100 text-green-700', label: 'Estoque OK' },
    low: { color: 'bg-yellow-100 text-yellow-700', label: 'Estoque Baixo' },
    critical: { color: 'bg-red-100 text-red-700', label: 'Crítico' },
    expiring: { color: 'bg-orange-100 text-orange-700', label: 'Vencendo' }
  };

  return (
    <main className="px-8 py-6 flex-1 overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-gray-800 mb-1">Estoque</h1>
            <p className="text-sm text-gray-500">Controle de insumos e materiais hospitalares</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Clock className="w-4 h-4 text-gray-600" />
              Ver Histórico
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              <Download className="w-4 h-4 text-gray-600" />
              Exportar
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#0EA5E9] text-white rounded-lg text-sm hover:bg-[#0284C7] transition-colors">
              <Plus className="w-4 h-4" />
              Novo Item
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Package className="w-8 h-8 text-blue-600" />
          </div>
          <p className="text-2xl text-gray-800">{totalItems}</p>
          <p className="text-xs text-gray-600">Itens em Estoque</p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-lg border border-red-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <span className="text-xs text-red-700">Urgente</span>
          </div>
          <p className="text-2xl text-gray-800">{criticalItems}</p>
          <p className="text-xs text-gray-600">Itens Críticos</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border border-orange-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-orange-600" />
          </div>
          <p className="text-2xl text-gray-800">{expiringItems}</p>
          <p className="text-xs text-gray-600">Itens Vencendo</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-2xl text-gray-800">{averageConsumption}</p>
          <p className="text-xs text-gray-600">Consumo Médio Diário</p>
        </div>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Lightbulb className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm text-blue-900 mb-2">Previsão de Consumo (IA)</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  <strong>Alerta crítico:</strong> Estoque de Soro Fisiológico será insuficiente em 3 dias com o consumo atual
                </p>
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  <strong>Consumo elevado detectado:</strong> Aumento de 25% no uso de materiais cirúrgicos relacionado a internações na UTI
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  <strong>Ação sugerida:</strong> Reabastecer Ampicilina e Luvas Cirúrgicas nos próximos 2 dias
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
            />
          </div>

          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-sm text-gray-700 bg-transparent border-none outline-none"
            >
              <option value="todas">Todas as Categorias</option>
              <option value="medicamento">Medicamentos</option>
              <option value="material">Materiais</option>
              <option value="insumo">Insumos</option>
              <option value="equipamento">Equipamentos</option>
            </select>
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 outline-none"
          >
            <option value="todos">Todos os Status</option>
            <option value="ok">Estoque OK</option>
            <option value="low">Estoque Baixo</option>
            <option value="critical">Crítico</option>
            <option value="expiring">Vencendo</option>
          </select>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-gray-800">Lista de Itens ({filteredInventory.length})</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Item</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Categoria</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Quantidade</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Unidade</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Setor</th>
              <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">Última Movimentação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredInventory.map(item => (
              <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${
                item.status === 'critical' ? 'bg-red-50' : 
                item.status === 'low' ? 'bg-yellow-50' : ''
              }`}>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-800 font-medium">{item.name}</p>
                  {item.expiryDate && (
                    <p className="text-xs text-gray-500">Validade: {item.expiryDate}</p>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-700 capitalize">
                    {categoryLabels[item.category]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className={`text-sm font-medium ${
                    item.status === 'critical' ? 'text-red-600' :
                    item.status === 'low' ? 'text-yellow-600' :
                    'text-gray-800'
                  }`}>
                    {item.quantity}
                  </p>
                  <p className="text-xs text-gray-500">Mín: {item.minQuantity}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.unit}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs ${statusConfig[item.status].color}`}>
                    {statusConfig[item.status].label}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.sector}</td>
                <td className="px-6 py-4 text-xs text-gray-500">{item.lastMovement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Consumption Analytics */}
      <div>
        <h2 className="text-gray-800 mb-4">Análise de Consumo</h2>
        <div className="grid grid-cols-2 gap-6">
          {/* Consumo por Setor */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Consumo por Setor</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={consumptionBySectorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="sector" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                <Bar dataKey="consumo" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tendência de Consumo */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-gray-800 mb-4">Tendência de Consumo (Última Semana)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={consumptionTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="day" stroke="#6B7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px' }} />
                <Line type="monotone" dataKey="consumo" stroke={COLORS.success} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Ranking de Consumo */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-bold">1º</span>
              </div>
              <div>
                <p className="text-sm text-gray-800 font-medium">UTI</p>
                <p className="text-xs text-gray-500">450 itens/semana</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-bold">2º</span>
              </div>
              <div>
                <p className="text-sm text-gray-800 font-medium">Centro Cirúrgico</p>
                <p className="text-xs text-gray-500">380 itens/semana</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-600 h-2 rounded-full" style={{ width: '84%' }}></div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center">
                <span className="text-cyan-600 font-bold">3º</span>
              </div>
              <div>
                <p className="text-sm text-gray-800 font-medium">Pronto Socorro</p>
                <p className="text-xs text-gray-500">320 itens/semana</p>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-cyan-600 h-2 rounded-full" style={{ width: '71%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
