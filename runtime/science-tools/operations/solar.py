from importlib.metadata import version
from datetime import datetime
import math
import numpy as np
import pandas as pd
import pvlib
from worker import InputError, number, sequence, exact_keys


def calculate(data):
    exact_keys(data,{"latitude","longitude","altitude","tilt","azimuth","dcPower","acPower","gamma","losses","albedo","weather"})
    lat=number(data,"latitude",-89,89); lon=number(data,"longitude",-180,180)
    altitude=number(data,"altitude",-400,6000,0); tilt=number(data,"tilt",0,90,25); azimuth=number(data,"azimuth",0,360,0)
    dc=number(data,"dcPower",0.01,100000,5)*1000; ac=number(data,"acPower",0.01,100000,5)*1000
    gamma=number(data,"gamma",-0.01,-0.0001,-0.004); losses=number(data,"losses",0,50,14); albedo=number(data,"albedo",0,1,0.2)
    times=[]; records=[]
    for row in sequence(data,"weather",2,8784):
        if not isinstance(row,list) or len(row)!=6 or not isinstance(row[0],str) or len(row[0])>35:
            raise InputError("Cada leitura precisa de data ISO com fuso, GHI, DNI, DHI, temperatura e vento.")
        try: timestamp=datetime.fromisoformat(row[0].replace("Z","+00:00"))
        except ValueError as exc: raise InputError("Data inválida. Use ISO 8601, por exemplo 2026-01-15T12:00:00-03:00.") from exc
        if timestamp.tzinfo is None or timestamp.utcoffset() is None: raise InputError("Todas as datas devem informar o fuso horário.")
        values={key:value for key,value in zip(("ghi","dni","dhi","temperature","wind"),row[1:])}
        records.append([number(values,"ghi",0,1600),number(values,"dni",0,1600),number(values,"dhi",0,1200),number(values,"temperature",-60,70),number(values,"wind",0,70)])
        times.append(timestamp)
    index=pd.to_datetime(times,utc=True)
    delta=np.diff(index.as_unit("ns").asi8)/3.6e12
    if np.any(delta<=0) or np.any(delta>3) or not np.allclose(delta,delta[0],rtol=0,atol=1e-8):
        raise InputError("A série deve ser crescente, sem duplicatas nem lacunas, em intervalos constantes de até 3 horas.")
    if (index[-1]-index[0]).total_seconds()>367*86400: raise InputError("Informe até um ano de dados por cálculo.")
    weather=pd.DataFrame(records,index=index,columns=["ghi","dni","dhi","temp_air","wind_speed"])
    location=pvlib.location.Location(lat,lon,tz="UTC",altitude=altitude)
    position=location.get_solarposition(index)
    poa=pvlib.irradiance.get_total_irradiance(surface_tilt=tilt,surface_azimuth=azimuth,solar_zenith=position.apparent_zenith,solar_azimuth=position.azimuth,dni=weather.dni,ghi=weather.ghi,dhi=weather.dhi,albedo=albedo,model="isotropic")
    irradiance=poa.poa_global.clip(lower=0)
    temperature=pvlib.temperature.sapm_cell(irradiance,weather.temp_air,weather.wind_speed,**pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"])
    pdc=pvlib.pvsystem.pvwatts_dc(irradiance,temperature,pdc0=dc,gamma_pdc=gamma).clip(lower=0)*(1-losses/100)
    pac=pvlib.inverter.pvwatts(pdc,pdc0=ac/0.96,eta_inv_nom=0.96).clip(lower=0)
    energy=pac*float(delta[0])/1000
    # Calendar attribution follows each timestamp's declared offset, not UTC month boundaries.
    months=[t.strftime("%Y-%m") for t in times]
    monthly=pd.Series(energy.to_numpy(),index=months).groupby(level=0).sum()
    rows=[[times[i].isoformat(),float(irradiance.iloc[i]),float(temperature.iloc[i]),float(pdc.iloc[i])/1000,float(pac.iloc[i])/1000,float(energy.iloc[i])] for i in range(len(times))]
    stride=max(1,math.ceil(len(rows)/500))
    return {"title":"Produção de energia fotovoltaica","engine":"pvlib "+version("pvlib"),"method":"Posição solar, transposição isotrópica da irradiância, temperatura de célula SAPM e conversão DC/AC PVWatts.","inputs":data,"summary":[{"label":"Energia no período informado","value":float(energy.sum()),"unit":"kWh"},{"label":"Produtividade no período","value":float(energy.sum())/(dc/1000),"unit":"kWh/kWp"},{"label":"Potência AC máxima","value":float(pac.max())/1000,"unit":"kW"},{"label":"Duração representada","value":len(times)*float(delta[0]),"unit":"h"}],"tables":[{"title":"Energia por mês presente na série","columns":["Mês","Energia (kWh)"],"rows":[[m,float(v)] for m,v in monthly.items()]},{"title":"Resultados por intervalo","columns":["Data com fuso","POA (W/m²)","Tcélula (°C)","Pdc (kW)","Pac (kW)","Energia (kWh)"],"rows":rows}],"charts":[{"title":"Potência AC ao longo da série","xLabel":"Horas desde a primeira leitura","yLabel":"Potência (kW)","series":[{"name":"AC","points":[[i*float(delta[0]),rows[i][4]] for i in range(0,len(rows),stride)]}]}],"assumptions":["Resultados cobrem exclusivamente a série enviada. Cada leitura representa a média do seu intervalo; o último usa a mesma duração dos anteriores. Não há extrapolação anual.","GHI, DNI e DHI são fornecidos pelo usuário. O cálculo não consulta serviços meteorológicos nem aceita endereços externos.","Módulos fixos em estrutura aberta, vidro/vidro, sem sombras de obstáculos. Azimute: 0° norte, 90° leste, 180° sul, 270° oeste.","Perdas globais incidem em DC; inversor usa eficiência nominal de 96% e limite AC informado. Não inclui tarifa, crédito de energia, degradação ou retorno financeiro."]}
