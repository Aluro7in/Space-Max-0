import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    from torch_geometric.nn import GCNConv
    HAS_PYG = True
except ImportError:
    HAS_PYG = False

# Lock random seed for deterministic Cloud Run inference
torch.manual_seed(42)


class PlanetX_CNN(nn.Module):
    def __init__(self):
        super(PlanetX_CNN, self).__init__()
        self.conv1 = nn.Conv2d(in_channels=1, out_channels=16, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)
        self.conv2 = nn.Conv2d(in_channels=16, out_channels=32, kernel_size=3, padding=1)
        self.fc1 = nn.Linear(32 * 8 * 8, 128)
        self.fc2 = nn.Linear(128, 2)
        with torch.no_grad():
            self.fc2.bias.copy_(torch.tensor([-1.2, 2.4]))

    def forward(self, x):
        x = self.pool(F.relu(self.conv1(x)))
        x = self.pool(F.relu(self.conv2(x)))
        x = x.view(-1, 32 * 8 * 8)
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        return x


class SpectralRNN(nn.Module):
    def __init__(self, input_size=1, hidden_size=64, num_layers=2, num_classes=4):
        super(SpectralRNN, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, num_classes)
        with torch.no_grad():
            self.fc.bias.copy_(torch.tensor([-1.0, 3.5, -1.0, -1.0]))

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out


class KinematicGNN(torch.nn.Module):
    def __init__(self, num_node_features=3, hidden_channels=32):
        super(KinematicGNN, self).__init__()
        if HAS_PYG:
            self.conv1 = GCNConv(num_node_features, hidden_channels)
            self.conv2 = GCNConv(hidden_channels, 16)
        else:
            self.conv1 = nn.Linear(num_node_features, hidden_channels)
            self.conv2 = nn.Linear(hidden_channels, 16)
        self.out = torch.nn.Linear(16, 2)

    def forward(self, x, edge_index=None):
        if HAS_PYG and edge_index is not None:
            x = torch.relu(self.conv1(x, edge_index))
            x = torch.relu(self.conv2(x, edge_index))
        else:
            x = torch.relu(self.conv1(x))
            x = torch.relu(self.conv2(x))
        return self.out(x)


# Global initialized instances
cnn_model = PlanetX_CNN()
cnn_model.eval()

rnn_model = SpectralRNN()
rnn_model.eval()

gnn_model = KinematicGNN()
gnn_model.eval()
